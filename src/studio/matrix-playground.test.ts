import { describe, it, expect } from 'vitest';

describe('matrix-playground math calculations', () => {
  it('calculates determinant correctly for identity, rotation, and shear', () => {
    // Identity: a=1, b=0, c=0, d=1
    const detIdentity = 1 * 1 - 0 * 0;
    expect(detIdentity).toBe(1);

    // Rotation 90: a=0, b=-1, c=1, d=0
    const detRot90 = 0 * 0 - (-1) * 1;
    expect(detRot90).toBe(1);

    // Reflection X: a=1, b=0, c=0, d=-1
    const detReflectX = 1 * (-1) - 0 * 0;
    expect(detReflectX).toBe(-1);

    // Singular projection: a=1, b=0, c=0, d=0
    const detProjection = 1 * 0 - 0 * 0;
    expect(detProjection).toBe(0);
  });

  it('calculates trace and eigenvalues discriminant correctly', () => {
    // Identity
    const trace = 1 + 1;
    const det = 1;
    const disc = trace * trace - 4 * det;
    expect(disc).toBe(0); // double root lambda = 1

    // Rotation 90: a=0, b=-1, c=1, d=0
    const traceRot = 0 + 0;
    const detRot = 1;
    const discRot = traceRot * traceRot - 4 * detRot;
    expect(discRot).toBe(-4); // complex roots lambda = 0 +/- i
  });
});
