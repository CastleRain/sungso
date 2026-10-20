import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('청첩장은 외부 영상이나 YouTube 재생 코드를 요청하지 않는다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /youtube|youtu\.be|wedding-music|music-toolbar/i);
  const folder = new URL('../js/', import.meta.url);
  for (const name of await readdir(folder)) {
    if (!name.endsWith('.mjs')) continue;
    const source = await readFile(new URL(name, folder), 'utf8');
    assert.doesNotMatch(source, /youtube(?:-nocookie)?\.com|youtu\.be|InvitationMusic|onYouTubeIframeAPIReady/i);
  }
});
