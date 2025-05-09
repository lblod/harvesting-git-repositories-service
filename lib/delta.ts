type _Delta = {
  inserts: _Triple[];
  deletes: _Triple[];
};
type _Triple = {
  subject: _Node;
  predicate: _Node;
  object: _Node;
};
type _Node = { value: string };

export class Delta {
  delta: _Delta[];
  constructor(delta: _Delta[]) {
    this.delta = delta;
  }

  get inserts() {
    return this.delta.flatMap((changeSet) => changeSet.inserts);
  }

  getInsertsFor(predicate: string, object: string) {
    return this.inserts
      .filter(
        (t) => t.predicate.value === predicate && t.object.value === object,
      )
      .map((t) => t.subject.value);
  }
}
