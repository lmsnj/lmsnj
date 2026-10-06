import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newMessageNotices, previewText, unreadConversations } from './chatNotices.js'

const conv = (id, unread) => ({ id, unread, other: { full_name: `Orang ${id}` } })

test('pengecekan pertama tidak memunculkan pemberitahuan', () => {
  assert.deepEqual(newMessageNotices(null, [conv(1, 3)]), [])
})

test('hanya percakapan yang pesannya bertambah', () => {
  const before = [conv(1, 1), conv(2, 0)]
  const after = [conv(1, 1), conv(2, 2), conv(3, 1)]
  assert.deepEqual(
    newMessageNotices(before, after).map((c) => c.id),
    [2, 3],
  )
  // Pesan dibaca (berkurang) tidak memunculkan pemberitahuan.
  assert.deepEqual(newMessageNotices(after, [conv(1, 0), conv(2, 2), conv(3, 1)]), [])
})

test('daftar belum dibaca dan potongan pesan', () => {
  assert.deepEqual(
    unreadConversations([conv(1, 0), conv(2, 1)]).map((c) => c.id),
    [2],
  )
  assert.equal(previewText('  Halo\n  Pak  '), 'Halo Pak')
  assert.equal(previewText('a'.repeat(100), 10), `${'a'.repeat(9)}…`)
  assert.equal(previewText(null), '')
})
