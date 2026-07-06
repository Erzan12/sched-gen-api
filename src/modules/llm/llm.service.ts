import { Injectable } from '@nestjs/common';
import { MeetingsService } from '../meetings/meetings/meetings.service';
import { AvailabilityService } from '../meetings/availability/availability.service';
import Groq from 'groq-sdk';
import { Prisma, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

console.log(process.env.GROQ_API_KEY);
console.log(process.env.GROQ_MODEL);

// const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const toolDefs = [
    {
        type: "function" as const,
        function: {
            name: "createMeeting",
            description: 
                "Create a meeting. If it returns a conflict or scheduleConflict, present the options to the user and wait for them to choose — never call this again with a different time on your own.",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    date: { type: "string", description: "yyyy-MM-dd" },
                    time: { type: "string", description: "HH:mm 24h" },
                    durationMinutes: { type: "number" },
                    attendees: { type: "array", items: { type: "string" } },
                    notes: { type: "string" },
                },
                required: ["title", "date", "time"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "checkAvailability",
            description: "Check free time windows for a date without booking anything.",
            parameters: {
                type: "object",
                properties: { date: { type: "string" } },
                required: ["date"],
            },
        },
    },
];

@Injectable()
export class LlmService {
    private groq: Groq;
    private model: string;

    constructor(
        private meetings: MeetingsService,
        private availability: AvailabilityService,
        private configService: ConfigService
    ) {
        // Initialize inside the constructor
        const apiKey = this.configService.get<string>('GROQ_API_KEY');
        this.model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
        
        if (!apiKey) {
            throw new Error('GROQ_API_KEY is missing from environment variables');
        }
        
        this.groq = new Groq({ apiKey });
    }

    async *runTurn(messages: Groq.Chat.ChatCompletionMessageParam[]) {
        // let currentMessages = [...messages];
        const today = new Date().toISOString().split("T")[0]; // yyyy-MM-dd

        const systemMessage: Groq.Chat.ChatCompletionMessageParam = {
            role: "system",
            content: `Today's date is ${today}. Always resolve relative dates ("Saturday", "next Sunday", "tomorrow") to an exact yyyy-MM-dd before calling any tool. Never call a tool with a non-ISO date string.`,
        };

        let currentMessages: Groq.Chat.ChatCompletionMessageParam[] = [systemMessage, ...messages];

        while (true) {
            const completion = await this.groq.chat.completions.create({
                model: this.model,
                messages: currentMessages,
                tools: toolDefs,
                tool_choice: "auto",
                stream: true,
            });

            let assistantText = "";
            let toolCalls: any[] = [];

            for await (const chunk of completion) {
                const delta = chunk.choices[0]?.delta;
                if (delta?.content) {
                    assistantText += delta.content;
                    yield { type: "text", delta: delta.content };
                }
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index;
                        toolCalls[idx] = toolCalls[idx] || { id: tc.id, function: { name: "", arguments: "" } };
                        if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                        if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                }
            }

            if (toolCalls.length === 0) {
                currentMessages.push({ role: "assistant", content: assistantText });
                break;
            }

            currentMessages.push({
                role: Role.assistant,
                content: assistantText || null,
                tool_calls: toolCalls.map((tc) => ({
                    id: tc.id,
                    type: "function",
                    function: tc.function,
                })),
            } as any);

            // for (const tc of toolCalls) {
            //     const args = JSON.parse(tc.function.arguments);
            //     let result: any;

            //     if (tc.function.name === "createMeeting") {
            //         result = await this.meetings.createMeetings(args);
            //     } else if (tc.function.name === "checkAvailability") {
            //         result = { freeSlots: this.availability.getFreeSlots(args.date) };
            //     }

            //     yield { type: "tool_result", name: tc.function.name, args, result };

            //     currentMessages.push({
            //         role: Role.tool,
            //         tool_call_id: tc.id,
            //         content: JSON.stringify(result),
            //     } as any);
            // }
            for (const tc of toolCalls) {
                const args = JSON.parse(tc.function.arguments);
                let result: any;

                try {
                    if (tc.function.name === "createMeeting") {
                        result = await this.meetings.createMeetings(args);
                    } else if (tc.function.name === "checkAvailability") {
                        result = { freeSlots: this.availability.getFreeSlots(args.date) };
                    }
                } catch (err) {
                    result = {
                        error:
                            err instanceof Error
                                ? err.message
                                : "Tool execution failed.",
                    };
                }

                yield { type: "tool_result", name: tc.function.name, args, result };

                currentMessages.push({
                    role: Role.tool,
                    tool_call_id: tc.id,
                    content: JSON.stringify(result),
                } as any);
            }
            // loop again so the model can respond to tool results
        }
    }
}
