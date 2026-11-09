export interface SlotDaySchedule {
  weekday: number; // JavaScript weekday: Sunday = 0
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface SlotTimeCapacity {
  weekday: number;
  startTime: string;
  endTime: string;
  capacity: number;
}

export class SlotScheduleError extends Error {}

const parseTime = (value: unknown): number => {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new SlotScheduleError('Times must use 24-hour HH:mm format');
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export const normalizeSlotSchedule = (input: {
  weeklySchedule?: unknown;
  timeSlots?: unknown;
  slotIntervalMinutes?: unknown;
  perSlotCount?: unknown;
  perPersonMaxRegistration?: unknown;
}) => {
  if (input.weeklySchedule == null && input.timeSlots == null) return null;

  const interval = Number(input.slotIntervalMinutes ?? 60);
  const perSlotCount = Number(input.perSlotCount ?? 1);
  const maxRegistration = Number(input.perPersonMaxRegistration ?? 1);
  if (!Number.isInteger(interval) || interval < 5 || interval > 720) {
    throw new SlotScheduleError('Slot interval must be between 5 and 720 minutes');
  }
  if (!Number.isInteger(perSlotCount) || perSlotCount < 1) {
    throw new SlotScheduleError('Per-slot capacity must be at least 1');
  }
  if (!Number.isInteger(maxRegistration) || maxRegistration < 1) {
    throw new SlotScheduleError('Per-person max registration must be at least 1');
  }
  if (!Array.isArray(input.weeklySchedule) || input.weeklySchedule.length !== 7) {
    throw new SlotScheduleError('Provide a schedule for all seven weekdays');
  }

  const days = input.weeklySchedule.map((raw: any) => {
    const weekday = Number(raw?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof raw.enabled !== 'boolean') {
      throw new SlotScheduleError('Each weekday needs a valid weekday number and enabled flag');
    }
    const startTime = String(raw.startTime ?? '');
    const endTime = String(raw.endTime ?? '');
    if (raw.enabled && parseTime(endTime) <= parseTime(startTime)) {
      throw new SlotScheduleError('Working day end time must be after its start time');
    }
    return { weekday, enabled: raw.enabled, startTime, endTime } as SlotDaySchedule;
  });
  if (new Set(days.map((day) => day.weekday)).size !== 7) {
    throw new SlotScheduleError('Each weekday can be configured only once');
  }

  const configuredSlots: SlotTimeCapacity[] = [];
  for (const day of days.filter((item) => item.enabled)) {
    const start = parseTime(day.startTime);
    const end = parseTime(day.endTime);
    for (let cursor = start; cursor + interval <= end; cursor += interval) {
      const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      configuredSlots.push({
        weekday: day.weekday,
        startTime: format(cursor),
        endTime: format(cursor + interval),
        capacity: perSlotCount,
      });
    }
  }
  if (configuredSlots.length === 0) {
    throw new SlotScheduleError('Enable at least one weekday with a complete time slot');
  }

  const timeSlots = input.timeSlots == null ? configuredSlots : input.timeSlots;
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
    throw new SlotScheduleError('At least one time slot is required');
  }
  const validatedSlots = timeSlots.map((raw: any) => {
    const weekday = Number(raw?.weekday);
    const capacity = Number(raw?.capacity);
    const startTime = String(raw?.startTime ?? '');
    const endTime = String(raw?.endTime ?? '');
    const day = days.find((item) => item.weekday === weekday);
    if (!day?.enabled || !Number.isInteger(capacity) || capacity < 0 || capacity > 100_000 ||
        parseTime(endTime) <= parseTime(startTime) ||
        parseTime(endTime) - parseTime(startTime) !== interval ||
        parseTime(startTime) < parseTime(day.startTime) ||
        parseTime(endTime) > parseTime(day.endTime)) {
      throw new SlotScheduleError('A time slot has invalid hours, weekday, or capacity');
    }
    return { weekday, startTime, endTime, capacity } as SlotTimeCapacity;
  });
  for (const day of days) {
    const intervals = validatedSlots
      .filter((item) => item.weekday === day.weekday)
      .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
    for (let index = 1; index < intervals.length; index++) {
      if (parseTime(intervals[index].startTime) < parseTime(intervals[index - 1].endTime)) {
        throw new SlotScheduleError('Time slots on the same weekday cannot overlap');
      }
    }
  }
  if (validatedSlots.every((item) => item.capacity === 0)) {
    throw new SlotScheduleError('At least one generated time slot must have capacity');
  }

  return {
    slotIntervalMinutes: interval,
    perSlotCount,
    perPersonMaxRegistration: maxRegistration,
    weeklySchedule: days,
    timeSlots: validatedSlots,
  };
};

export const getSlotCapacityForDate = (slot: {
  dailyCount: number;
  weeklySchedule?: unknown;
  timeSlots?: unknown;
}, date: Date): number => {
  if (!Array.isArray(slot.weeklySchedule) || !Array.isArray(slot.timeSlots)) {
    return slot.dailyCount;
  }
  const weekday = date.getUTCDay();
  const day = (slot.weeklySchedule as SlotDaySchedule[]).find((item) => item.weekday === weekday);
  if (!day?.enabled) return 0;
  return (slot.timeSlots as SlotTimeCapacity[])
    .filter((item) => item.weekday === weekday)
    .reduce((total, item) => total + item.capacity, 0);
};

export const redistributeDailyCapacity = (
  timeSlots: unknown,
  dailyCapacity: number,
): SlotTimeCapacity[] | undefined => {
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) return undefined;
  const next = timeSlots.map((item: any) => ({ ...item })) as SlotTimeCapacity[];
  for (let weekday = 0; weekday < 7; weekday++) {
    const dayIndexes = next
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.weekday === weekday)
      .sort((a, b) => parseTime(a.item.startTime) - parseTime(b.item.startTime));
    if (dayIndexes.length === 0) continue;
    const each = Math.floor(dailyCapacity / dayIndexes.length);
    let remainder = dailyCapacity % dayIndexes.length;
    for (const { index } of dayIndexes) {
      next[index].capacity = each + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
    }
  }
  return next;
};

export const calculateScheduleCounts = (
  startDate: Date,
  endDate: Date,
  dailyCount: number,
  schedule: ReturnType<typeof normalizeSlotSchedule>,
) => {
  if (!schedule) {
    const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
    return { dailyCount, totalCount: dailyCount * Math.max(1, days) };
  }
  let totalCount = 0;
  let maxDailyCount = 0;
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  while (cursor.getTime() <= end) {
    const capacity = getSlotCapacityForDate({ ...schedule, dailyCount }, cursor);
    totalCount += capacity;
    maxDailyCount = Math.max(maxDailyCount, capacity);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { dailyCount: Math.max(1, maxDailyCount), totalCount };
};
