// Resolve the self-reference explicitly. PostgREST can interpret a self-join hint
// as the inverse (children) relation, returning [] instead of the linked guardian.
export async function withParents(client, rows) {
  const ids = [...new Set(rows.map(row => row.parent_id).filter(Boolean))];
  if (!ids.length) return rows.map(row => ({ ...row, parent: null }));
  // Use the caller's client so browser/session RLS remains in effect.
  const { data, error } = await client.from('profiles').select('*').in('id', ids).eq('role', 'parent');
  if (error) throw error;
  const parents = new Map((data || []).map(parent => [parent.id, parent]));
  return rows.map(row => ({ ...row, parent: parents.get(row.parent_id) || null }));
}
