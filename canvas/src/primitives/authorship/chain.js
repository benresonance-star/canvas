export function appendAuthorStep(chain, step) {
  if (!Array.isArray(chain)) {
    throw new Error('author_chain must be an array');
  }
  return [...chain, { ...step }];
}

export function currentAuthor(chain) {
  if (!chain?.length) return null;
  return chain[chain.length - 1];
}

export function validateAuthorChain(chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error('author_chain is required and must be non-empty');
  }
  for (const step of chain) {
    if (!step.kind || !step.id || !step.action || !step.at) {
      throw new Error('invalid AuthorStep');
    }
  }
}
