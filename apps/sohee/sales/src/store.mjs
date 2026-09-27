export const CURRENT = 'sohee_sales/current';
export const chunkPath = (version, index) => `sohee_sales_versions/${version}/chunks/${index}`;

// All reads use the server. No persistent browser copy of private sales.
export function createSalesStore({ read, getMember, digest }) {
  let generation = 0, retired = false;
  return {
    clear() { retired = true; generation++; },
    async load() {
      const member = getMember(), ticket = ++generation;
      if (retired || !member) throw new Error('MEMBER_REQUIRED');
      const current = () => !retired && ticket === generation && getMember()?.uid === member.uid && getMember()?.role === member.role;
      const assert = () => { if (!current()) throw new Error('STALE_SESSION'); };
      const manifest = await read(CURRENT); assert();
      if (!manifest) return { data: null, manifest: null };
      if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.version) || !Number.isInteger(manifest.chunkCount) || manifest.chunkCount < 1 || manifest.chunkCount > 64) throw new Error('INVALID_MANIFEST');
      const chunks = await Promise.all(Array.from({ length: manifest.chunkCount }, (_, i) => read(chunkPath(manifest.version, i))));
      assert();
      if (chunks.some((v, i) => !v || v.index !== i || typeof v.payload !== 'string')) throw new Error('INCOMPLETE_SNAPSHOT');
      const content = chunks.map(v => v.payload).join('');
      if (await digest(content) !== manifest.version) throw new Error('INVALID_DIGEST');
      assert();
      const envelope = JSON.parse(content);
      if (envelope.schemaVersion !== 1 || !envelope.data?.monthly?.length) throw new Error('INVALID_SNAPSHOT');
      return { data: envelope.data, manifest };
    }
  };
}
