/** Đồng hồ có thể thay trong test. Mọi mốc thời gian nghiệp vụ lấy từ đây, không dùng now() của SQL. */
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
export class FakeClock implements Clock {
  t: number;
  constructor(start = Date.now()) { this.t = start; }
  now() { return new Date(this.t); }
  advance(ms: number) { this.t += ms; }
}
export const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
export const DAY = 86_400_000;
