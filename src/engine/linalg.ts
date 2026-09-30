/**
 * Solve A·x = b by Gaussian elimination with partial pivoting.
 * Returns the index of the first column with no usable pivot when the system
 * is singular. For a truss that means a degree of freedom nothing resists:
 * the structure is a mechanism and can fold.
 */
export type LinearSolution = { ok: true; x: number[] } | { ok: false; singularColumn: number };

export function solveLinear(A: number[][], b: number[]): LinearSolution {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(A[i][i]));
  const tol = Math.max(scale, 1e-12) * 1e-9;

  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < tol) return { ok: false, singularColumn: k };
    if (p !== k) [M[p], M[k]] = [M[k], M[p]];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      if (f === 0) continue;
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return { ok: true, x };
}
