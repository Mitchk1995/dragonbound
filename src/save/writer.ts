/** Serialises snapshots so a slow older write cannot overwrite newer progress. */
export class SaveWriter {
  private pending: Promise<void> = Promise.resolve();

  constructor(private writeSnapshot: (json: string) => Promise<void>) {}

  write(json: string): Promise<void> {
    const next = this.pending.then(() => this.writeSnapshot(json));
    this.pending = next.catch(() => {});
    return next;
  }
}
