export class ArrangementEngine {
  constructor(initialState = {}) {
    this.state = {
      sections: initialState.sections ?? [],
      activeSectionId: initialState.activeSectionId ?? null,
    };
  }

  addSection(section) {
    this.state = {
      ...this.state,
      sections: [...this.state.sections, section],
    };
    return this.state;
  }
}
