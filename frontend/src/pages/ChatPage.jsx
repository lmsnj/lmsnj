import {
  ArrowLeft,
  Bell,
  Heart,
  MessageCircle,
  MessageCirclePlus,
  MessagesSquare,
  Search,
  Send,
  Smile,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { chatApi } from '../api/chat'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Modal from '../components/Modal'
import PageHero, { HeroButton } from '../components/PageHero'
import Spinner from '../components/Spinner'
import TextField from '../components/TextField'
import useAuth from '../hooks/useAuth'
import useDebounce from '../hooks/useDebounce'
import useFetch from '../hooks/useFetch'
import usePolling from '../hooks/usePolling'
import useQueryFlag from '../hooks/useQueryFlag'
import { getErrorMessage } from '../utils/errors'
import { matchesSearch } from '../utils/listFilters'

const MESSAGE_POLL_MS = 4000
const LIST_POLL_MS = 10000
const HERO_ICONS = [MessageCircle, Smile, Send, Users, MessagesSquare, Bell, Heart]

const timeFormat = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })

function shortTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return date.toDateString() === new Date().toDateString()
    ? timeFormat.format(date)
    : dayFormat.format(date)
}

function Avatar({ name, className = 'size-10' }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800 ${className}`}
    >
      {initials}
    </span>
  )
}

function personMeta(person) {
  return person.classroom_name
    ? `${person.role_display} · ${person.classroom_name}`
    : person.role_display
}

function ContactPicker({ onClose, onPick }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)
  const contacts = useFetch(chatApi.contacts, debounced)
  return (
    <Modal open title="Pesan Baru" onClose={onClose}>
      <TextField
        placeholder="Cari nama..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Cari kontak"
        autoFocus
      />
      <p className="mt-2 text-xs text-slate-500">
        Siswa dapat mengirim pesan ke admin, wali kelas, dan guru yang mengajar di kelasnya.
      </p>
      <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
        {contacts.loading && !contacts.data ? (
          <li className="py-6 text-center text-brand-600">
            <Spinner />
          </li>
        ) : !contacts.data?.length ? (
          <li className="py-6 text-center text-sm text-slate-500">Tidak ada kontak yang cocok.</li>
        ) : (
          contacts.data.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onPick(person)}
                className="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-slate-50"
              >
                <Avatar name={person.full_name} className="size-9 text-sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    {person.full_name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {personMeta(person)}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </Modal>
  )
}

function Thread({ conversation, onBack, onActivity }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    let ignore = false
    chatApi
      .messages(conversation.id)
      .then((data) => !ignore && setMessages(data))
      .catch((err) => !ignore && setError(getErrorMessage(err)))
    return () => {
      ignore = true
    }
  }, [conversation.id])

  // Ambil hanya pesan yang lebih baru dari pesan terakhir yang sudah tampil.
  const fetchNew = useCallback(async () => {
    if (!messages) return
    const lastId = messages.at(-1)?.id
    const fresh = await chatApi.messages(conversation.id, lastId).catch(() => [])
    if (fresh.length) {
      setMessages((current) => [
        ...current,
        ...fresh.filter((m) => !current.some((c) => c.id === m.id)),
      ])
      onActivity()
    }
  }, [messages, conversation.id, onActivity])
  usePolling(fetchNew, MESSAGE_POLL_MS)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  const send = async (event) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setSending(true)
    setError('')
    try {
      const message = await chatApi.send(conversation.id, body)
      setMessages((current) => [...(current ?? []), message])
      setDraft('')
      onActivity()
    } catch (err) {
      setError(
        err.response?.status === 429
          ? 'Terlalu banyak pesan dalam waktu singkat. Tunggu sebentar.'
          : getErrorMessage(err),
      )
    } finally {
      setSending(false)
    }
  }

  const other = conversation.other
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
          aria-label="Kembali ke daftar percakapan"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <Avatar name={other.full_name} className="size-10 text-sm ring-2 ring-brand-200" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{other.full_name}</p>
          <p className="truncate text-xs text-slate-500">{personMeta(other)}</p>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
        {!messages ? (
          <div className="py-10 text-center text-brand-600">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
              <Smile className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm text-slate-500">
              Belum ada pesan. Mulai percakapan dengan sopan. 🙂
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender === user.id
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    mine
                      ? 'rounded-br-md bg-brand-600 text-white'
                      : 'rounded-bl-md bg-white text-slate-800'
                  }`}
                >
                  <p className="break-words whitespace-pre-wrap">{m.body}</p>
                  <p
                    className={`mt-0.5 text-right text-[11px] ${mine ? 'text-white/70' : 'text-slate-400'}`}
                  >
                    {shortTime(m.created_at)}
                    {mine && (m.read_at ? ' · dibaca' : '')}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <Alert type="error" className="mb-2">
          {error}
        </Alert>
        {conversation.can_send ? (
          <form onSubmit={send} className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter = kirim, Shift+Enter = baris baru.
                if (event.key === 'Enter' && !event.shiftKey) send(event)
              }}
              rows={1}
              maxLength={2000}
              placeholder="Tulis pesan..."
              aria-label="Tulis pesan"
              className="max-h-32 min-h-10 flex-1 resize-y rounded-lg border-0 px-3 py-2 text-base ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 sm:text-sm"
            />
            <Button
              type="submit"
              loading={sending}
              disabled={!draft.trim()}
              aria-label="Kirim pesan"
            >
              <Send className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Kirim</span>
            </Button>
          </form>
        ) : (
          <p className="text-center text-sm text-slate-500">
            Anda tidak bisa lagi mengirim pesan ke pengguna ini (misalnya siswa sudah pindah kelas).
          </p>
        )}
      </div>
    </div>
  )
}

// Ruang Obrolan: pesan langsung antar pengguna (aturan siapa-boleh-dengan-siapa ada di backend).
export default function ChatPage() {
  const openPicker = useQueryFlag('baru') === '1'
  const [picking, setPicking] = useState(openPicker)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const conversations = useFetch(chatApi.conversations)
  usePolling(conversations.reload, LIST_POLL_MS)

  const pick = async (person) => {
    setPicking(false)
    try {
      const conversation = await chatApi.start(person.id)
      setSelected(conversation)
      conversations.reload()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const list = conversations.data ?? []
  const shownList = list.filter((c) => matchesSearch(c.other.full_name, search))
  const unreadTotal = list.reduce((sum, c) => sum + (c.unread ?? 0), 0)
  // Data percakapan terpilih diperbarui dari daftar (mis. status can_send).
  const current = selected && (list.find((c) => c.id === selected.id) ?? selected)

  return (
    <>
      <PageHero
        title="Ruang Obrolan"
        description="Pesan langsung dengan guru, wali kelas, siswa, dan admin sekolah."
        icons={HERO_ICONS}
        centerIcon={MessagesSquare}
        actions={
          <HeroButton icon={MessageCirclePlus} onClick={() => setPicking(true)}>
            Pesan Baru
          </HeroButton>
        }
        stats={[
          {
            icon: MessagesSquare,
            content: (
              <>
                <strong className="text-white">{list.length} percakapan</strong>
              </>
            ),
          },
          {
            icon: Bell,
            content: (
              <>
                <strong className="text-white">{unreadTotal} pesan</strong> belum dibaca
              </>
            ),
          },
        ]}
      />
      <Alert type="error" className="mt-4">
        {error || conversations.error}
      </Alert>

      <div className="mt-6 grid h-[calc(100dvh-10rem)] min-h-[30rem] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:grid-cols-[20rem_1fr]">
        <aside
          className={`flex min-h-0 flex-col border-slate-200 bg-slate-50/60 md:border-r ${current ? 'hidden md:flex' : ''}`}
        >
          <div className="border-b border-slate-200 p-3">
            <p className="mb-2 px-1 text-sm font-semibold text-slate-900">Percakapan</p>
            <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-600">
              <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama..."
                aria-label="Cari percakapan"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base focus:ring-0 focus:outline-none sm:text-sm"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.loading && !conversations.data ? (
              <div className="py-10 text-center text-brand-600">
                <Spinner />
              </div>
            ) : shownList.length === 0 ? (
              <div className="p-6 text-center">
                <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <MessageCircle className="size-7" aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm text-slate-500">
                  {list.length
                    ? 'Tidak ada percakapan yang cocok.'
                    : 'Belum ada percakapan. Klik “Pesan Baru” untuk memulai.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-1 p-2">
                {shownList.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        current?.id === c.id
                          ? 'bg-white shadow-sm ring-2 ring-brand-600'
                          : 'hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <Avatar
                        name={c.other.full_name}
                        className={`size-11 ${c.unread ? 'ring-2 ring-brand-500' : ''}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium text-slate-900">
                            {c.other.full_name}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {shortTime(c.last_message_at)}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-xs ${c.unread ? 'font-semibold text-slate-800' : 'text-slate-500'}`}
                          >
                            {c.last_message
                              ? `${c.last_message_is_mine ? 'Anda: ' : ''}${c.last_message}`
                              : personMeta(c.other)}
                          </span>
                          {c.unread > 0 && (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
                              {c.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
        <section className={`min-h-0 bg-slate-50 ${current ? '' : 'hidden md:block'}`}>
          {current ? (
            <Thread
              key={current.id}
              conversation={current}
              onBack={() => setSelected(null)}
              onActivity={conversations.reload}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <span className="flex size-20 rotate-[-6deg] items-center justify-center rounded-3xl bg-brand-600 text-white shadow-lg">
                <MessagesSquare className="size-10" aria-hidden="true" />
              </span>
              <p className="mt-5 text-lg font-semibold text-slate-900">Pilih percakapan</p>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Buka percakapan di sebelah kiri, atau mulai pesan baru dengan guru dan teman.
              </p>
              <Button className="mt-4" onClick={() => setPicking(true)}>
                <MessageCirclePlus className="size-4" aria-hidden="true" /> Pesan Baru
              </Button>
            </div>
          )}
        </section>
      </div>

      {picking && <ContactPicker onClose={() => setPicking(false)} onPick={pick} />}
    </>
  )
}
