export class Metrics {
  private activeCodes = 0;
  private lockedCodes = 0;
  private cooldownCodes = 0;
  private wsConnections = 0;
  private joinFailures = 0;
  private rateLimitHits = 0;

  setActiveCodes(count: number) {
    this.activeCodes = count;
  }

  setLockedCodes(count: number) {
    this.lockedCodes = count;
  }

  setCooldownCodes(count: number) {
    this.cooldownCodes = count;
  }

  incWsConnections() {
    this.wsConnections++;
  }

  decWsConnections() {
    this.wsConnections = Math.max(0, this.wsConnections - 1);
  }

  incJoinFailures() {
    this.joinFailures++;
  }

  incRateLimitHits() {
    this.rateLimitHits++;
  }

  toPrometheusText(): string {
    return [
      '# HELP beamcode_active_codes Number of currently active codes',
      '# TYPE beamcode_active_codes gauge',
      `beamcode_active_codes ${this.activeCodes}`,
      '# HELP beamcode_locked_codes Number of currently locked codes (transfers)',
      '# TYPE beamcode_locked_codes gauge',
      `beamcode_locked_codes ${this.lockedCodes}`,
      '# HELP beamcode_cooldown_codes Number of codes in cooldown',
      '# TYPE beamcode_cooldown_codes gauge',
      `beamcode_cooldown_codes ${this.cooldownCodes}`,
      '# HELP beamcode_ws_connections Number of active WebSocket connections',
      '# TYPE beamcode_ws_connections gauge',
      `beamcode_ws_connections ${this.wsConnections}`,
      '# HELP beamcode_join_failures_total Total failed code join attempts',
      '# TYPE beamcode_join_failures_total counter',
      `beamcode_join_failures_total ${this.joinFailures}`,
      '# HELP beamcode_rate_limit_hits_total Total rate limit violations',
      '# TYPE beamcode_rate_limit_hits_total counter',
      `beamcode_rate_limit_hits_total ${this.rateLimitHits}`,
      '',
    ].join('\n');
  }
}
