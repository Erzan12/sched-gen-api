// src/chat/chat.controller.ts
import { Controller, Post, Body, Res } from "@nestjs/common";
import type { Response } from "express";
import { LlmService } from "../llm/llm.service";
import { ChatRequestDto } from "./dto/chat.dto";

@Controller("chat")
export class ChatController {
  constructor(private llm: LlmService) {}

  @Post()
  async chat(@Body() body: ChatRequestDto, @Res() res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const event of this.llm.runTurn(body.messages)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  }
}