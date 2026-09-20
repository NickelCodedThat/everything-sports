/** Read stable, explicitly ordered PostgREST pages without silently accepting its row cap. */
export async function readPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
  limit = Infinity,
): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  while (rows.length < limit) {
    const requested = Math.min(size, limit - rows.length);
    const { data, error } = await fetchPage(
      rows.length,
      rows.length + requested - 1,
    );
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < requested) break;
  }
  return rows;
}
