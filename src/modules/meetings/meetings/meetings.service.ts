import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/config/prisma/prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MeetingsService {
    constructor(
        private prisma: PrismaService,
        private availability: AvailabilityService,
    ) {}

    async findConflict(date: string, time: string, durationMinutes: number) {
        const candidateStart = new Date(`${date}T${time}:00`);
        const candidateEnd = new Date(candidateStart.getTime() + durationMinutes * 60000);

        const sameDay = await this.prisma.meeting.findMany({ where: { date } });

        for ( const m of sameDay) {
            const existingStart = new Date(`${m.date}T${m.time}:00`);
            const existingEnd = new Date(existingStart.getTime() + m.durationMinutes * 60000);
            if (candidateStart < existingEnd && existingStart < candidateEnd) {
                return m;
            }
        }
        return null;
    }

    async createMeetings(args: {
        title: string;
        date: string;
        time: string;
        durationMinutes?: number;
        attendees?: string[];
        notes?: string;
    }) {
        const duration = args.durationMinutes ?? 30;

        const scheduleCheck = this.availability.checkAvailability(args.date, args.time, duration);
        if (!scheduleCheck.isAvailable) {
            const freeSlots = this.availability.getFreeSlots(args.date);
            return {
                scheduleConflict: true,
                message: `${scheduleCheck.reason} Free windows: ${freeSlots
                    .map((s) => `${s.start}-${s.end}`)
                    .join(", ")}`,
            };
        }

        const conflict = await this.findConflict(args.date, args.time, duration);
        if (conflict) {
            return {
                conflict,
                message: `This overlaps with "${conflict.title}".`,
            };
        }

        const meeting = await this.prisma.meeting.create({
            data: {
                title: args.title,
                date: args.date,
                time: args.time,
                durationMinutes: duration,
                attendees: args.attendees && [],
                notes: args.notes,
            },
        });

        return { meeting, message: `Scheduled "${args.title}" successfully.`};
    }
}
