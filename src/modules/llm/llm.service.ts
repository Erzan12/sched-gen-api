import { Injectable } from '@nestjs/common';
import { MeetingsService } from '../meetings/meetings/meetings.service';
import { AvailabilityService } from '../meetings/availability/availability.service';
import Groq from 'groq-sdk';
import { Prisma, Role } from '@prisma/client';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    constructor(
        private meetings: MeetingsService,
        private availability: AvailabilityService
    ) {}

    async *runTurn(messages: Groq.Chat.ChatCompletionMessageParam[]) {
        let currentMessages = [...messages];

        while (true) {
            const completion = await groq.chat.completions.create({
                model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
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

            for (const tc of toolCalls) {
                const args = JSON.parse(tc.function.arguments);
                let result: any;

                if (tc.function.name === "createMeeting") {
                    result = await this.meetings.createMeetings(args);
                } else if (tc.function.name === "checkAvailability") {
                    result = { freeSlots: this.availability.getFreeSlots(args.date) };
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
