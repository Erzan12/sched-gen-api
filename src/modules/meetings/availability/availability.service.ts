import { Injectable, BadRequestException  } from '@nestjs/common';
import { isValidDate } from 'rxjs/internal/util/isDate';

interface TimeBlock { start: string; end: string }
interface DayAvailability { free: TimeBlock[] }

const weeklySchedule: Record<number, DayAvailability> = {
    0: { free: [{ start: "00:00", end: "23:59" }] },   // Sunday — all day free
    1: { free: [{ start: "17:30", end: "21:00" }] },   // Monday
    2: { free: [{ start: "17:30", end: "21:00" }] },   // Tuesday
    3: { free: [{ start: "17:30", end: "21:00" }] },   // Wednesday
    4: { free: [{ start: "17:30", end: "21:00" }] },   // Thursday
    5: { free: [{ start: "17:30", end: "21:00" }] },   // Friday
    6: { free: [{ start: "12:30", end: "21:00" }] },   // Saturday — half day
};

const holidays: string[] = [];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}

function parseDow(date: string): number {
    if (!date || !DATE_RE.test(date)) {
        throw new BadRequestException(
            `Invalid date "${date}" — expected yyyy-MM-dd format.`
        );
    }
    const d = new Date(`${date}T00:00:00`);
    const dow = d.getDay();
    if (Number.isNaN(dow)) {
        throw new BadRequestException(`Could not parse date "${date}".`);
    }
    return dow;
}

@Injectable()
export class AvailabilityService {
    checkAvailability(date: string, time: string, durationMinutes: number) {
        const dow = parseDow(date);
        if (holidays.includes(date)) return { isAvailable: true };

        const start = toMinutes(time);
        const end = start + durationMinutes;
        const fits = weeklySchedule[dow].free.some((b) => {
            const bs = toMinutes(b.start);
            const be = toMinutes(b.end);
            return start >= bs && end <= be;
        });

        return fits
            ? { isAvailable: true }
            : { isAvailable: false, reason: "That's outside your available hours for that day." };
    }

    getFreeSlots(date: string) {
        const dow = parseDow(date);
        if (holidays.includes(date)) return [{ start: "00:00", end: "23:59" }];
        return weeklySchedule[dow].free;
    }
}
