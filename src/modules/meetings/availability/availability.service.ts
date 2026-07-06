import { Injectable } from '@nestjs/common';
import { isValidDate } from 'rxjs/internal/util/isDate';

interface TimeBlock { start: string; end: string }
interface DayAvailability { free: TimeBlock[] }

const weeklySchedule: Record<number, DayAvailability> = {
    1: { free: [{ start: "17:30", end: "21:00" }] },
    2: { free: [{ start: "17:30", end: "21:00" }] },
    3: { free: [{ start: "17:30", end: "21:00" }] },
    4: { free: [{ start: "17:30", end: "21:00" }] },
    5: { free: [{ start: "17:30", end: "21:00" }] },
    6: { free: [{ start: "12:30", end: "21:00" }] },
    7: { free: [{ start: "00:00", end: "23:59" }] },
};

const holidays: string[] = [];

function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}

@Injectable()
export class AvailabilityService {
    checkAvailability(date: string, time: string, durationMinutes: number) {
        const dow = new Date(`${date}T00:00:00`).getDay();
        if (holidays.includes(date)) return { isAvailable: true }

        const start = toMinutes(time);
        const end = start + durationMinutes;
        const fits = weeklySchedule[dow].free.some((b) => {
            const bs = toMinutes(b.start);
            const be = toMinutes(b.end);
            return start >= bs && end <= be;
        });

        return fits
            ? { isAvailable: true }
            : { isAvailable: false, reason: "That's outside your available hours for that day."};
    }

    getFreeSlots(date: string) {
        const dow = new Date(`${date}T00:00:00`).getDay();
        if (holidays.includes(date)) return [{ start: "00:00", end: "23:59" }];
        return weeklySchedule[dow].free;
    }
}
