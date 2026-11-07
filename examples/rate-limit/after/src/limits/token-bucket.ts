export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(private capacity: number, private refillPerSecond: number, now: number) {
    this.tokens = capacity;
    this.updatedAt = now;
  }

  refill(now: number): void {
    const elapsed = (now - this.updatedAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.updatedAt = now;
  }

  tryTake(): boolean {
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  secondsUntilNext(): number {
    return this.tokens >= 1 ? 0 : (1 - this.tokens) / this.refillPerSecond;
  }
}
