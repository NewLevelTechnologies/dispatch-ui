import { workspaceMark } from './workspaceMark';

describe('workspaceMark', () => {
  it('takes the first letter of the first two words', () => {
    expect(workspaceMark('Acme HVAC')).toBe('AH');
  });

  it('skips a legal suffix so it does not win a letter', () => {
    expect(workspaceMark('Acme HVAC Services')).toBe('AH');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(workspaceMark('Globex')).toBe('GL');
  });

  it('falls back to the first two characters when every word is a suffix', () => {
    expect(workspaceMark('Services Inc')).toBe('SE');
  });

  it('returns a placeholder for an empty or blank name', () => {
    expect(workspaceMark('')).toBe('?');
    expect(workspaceMark('   ')).toBe('?');
  });
});
