import { Check, Copy, Printer, Send } from 'lucide-react'
import { useState } from 'react'
import useAccountCards from '../hooks/useAccountCards'
import { whatsappUrl } from '../utils/accountCards'
import Button from './Button'

// Tombol salin teks; label berubah sebentar menjadi "Tersalin".
function CopyButton({ text, label = 'Salin' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false) // browser menolak akses clipboard; teks tetap terlihat untuk disalin manual
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={copy}>
      {copied ? (
        <Check className="size-4 text-brand-600" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {copied ? 'Tersalin' : label}
    </Button>
  )
}

/**
 * Daftar akun hasil reset/impor/cetak kartu: setiap akun bisa dikirim lewat WhatsApp atau disalin,
 * dan semuanya bisa dicetak sebagai kartu. `accounts`: [{ id?, full_name, username, classroom,
 * password }] — password null = tidak ditampilkan (pengguna memakai password lamanya).
 */
export default function AccountList({ accounts }) {
  const { address, textFor, printCards } = useAccountCards()
  const withPassword = accounts.some((account) => account.password)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {accounts.length} akun · alamat masuk{' '}
          <strong className="text-slate-900">{address}</strong>
        </p>
        <Button onClick={() => printCards(accounts)}>
          <Printer className="size-4" aria-hidden="true" /> Cetak Kartu ({accounts.length})
        </Button>
      </div>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-200">
        {accounts.map((account) => (
          <li
            key={account.id ?? account.username}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{account.full_name}</p>
              <p className="text-xs text-slate-500">
                {account.username}
                {account.classroom && ` · ${account.classroom}`}
                {account.password && (
                  <>
                    {' · '}
                    <span className="font-mono font-semibold text-slate-800">
                      {account.password}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <a
                href={whatsappUrl(textFor(account))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                aria-label={`Kirim akun ${account.full_name} lewat WhatsApp`}
              >
                <Send className="size-4" aria-hidden="true" /> WhatsApp
              </a>
              <CopyButton text={textFor(account)} />
            </div>
          </li>
        ))}
      </ul>
      {withPassword && (
        <p className="text-xs text-amber-700">
          Password hanya ditampilkan sekali ini. Kirim atau cetak sekarang; setelah jendela ditutup
          password tidak bisa dilihat lagi (harus direset ulang).
        </p>
      )}
    </div>
  )
}
