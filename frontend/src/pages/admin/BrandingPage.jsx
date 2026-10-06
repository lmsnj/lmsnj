import { Bell, ImageUp, RotateCcw, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '../../api/client'
import { brandingApi } from '../../api/branding'
import { schoolsApi } from '../../api/schools'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import SchoolLogo from '../../components/brand/SchoolLogo'
import PageHeader from '../../components/PageHeader'
import TextField from '../../components/TextField'
import useAuth from '../../hooks/useAuth'
import useBranding from '../../hooks/useBranding'
import useFormSubmit from '../../hooks/useFormSubmit'
import { ROLES } from '../../utils/constants'

const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const MAX_LOGO_MB = 2

function PreviewCard({ title, children }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</p>
      {children}
    </div>
  )
}

/**
 * Satu halaman untuk dua jenis identitas:
 * - Admin sekolah: "Identitas Sekolah" = nama, slogan, logo sekolah yang sedang dibuka (header).
 * - Admin yayasan: "Identitas Yayasan" = nama, slogan, nama aplikasi, logo yayasan (halaman login,
 *   judul tab, dan logo cadangan untuk sekolah yang belum punya logo).
 */
function useIdentitySource() {
  const { user, school, reloadSchools } = useAuth()
  const { app, setBranding } = useBranding()
  if (user.role === ROLES.FOUNDATION && !school) {
    return {
      isApp: true,
      current: app,
      save: async (data) => {
        const saved = await brandingApi.update(data)
        setBranding(saved)
        return saved
      },
    }
  }
  return {
    isApp: false,
    current: {
      school_name: school?.name ?? '',
      slogan: school?.slogan ?? '',
      app_name: app.app_name,
      logo_url: school?.logo_url ?? null,
    },
    save: async ({ school_name, slogan, logo, remove_logo }) => {
      const saved = await schoolsApi.update(school.id, {
        name: school_name,
        slogan,
        logo,
        remove_logo,
      })
      await reloadSchools()
      return { school_name: saved.name, slogan: saved.slogan, app_name: app.app_name }
    },
  }
}

export default function BrandingPage() {
  const { isApp, current, save } = useIdentitySource()
  const { app } = useBranding()
  const branding = current
  const [form, setForm] = useState({
    school_name: branding.school_name,
    slogan: branding.slogan,
    app_name: branding.app_name,
  })
  const [logoFile, setLogoFile] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [fileError, setFileError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef(null)

  // Data dari server bisa datang setelah halaman dibuka: isi form jika belum diubah.
  const [touched, setTouched] = useState(false)
  const shown = touched
    ? form
    : { school_name: branding.school_name, slogan: branding.slogan, app_name: branding.app_name }

  // Alamat sementara untuk pratinjau logo baru (dilepas lagi saat diganti/halaman ditutup).
  const preview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const update = (field, value) => {
    setForm({ ...shown, [field]: value })
    setTouched(true)
    setNotice('')
  }

  const pickLogo = (file) => {
    setFileError('')
    setNotice('')
    if (!file) return
    if (!LOGO_ACCEPT.split(',').includes(file.type)) {
      setFileError('Gunakan gambar PNG, JPG, WEBP, atau GIF.')
      return
    }
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      setFileError(`Ukuran logo maksimal ${MAX_LOGO_MB} MB.`)
      return
    }
    setLogoFile(file)
    setRemoveLogo(false)
  }

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const saved = await save({
      ...shown,
      logo: logoFile ?? undefined,
      remove_logo: removeLogo || undefined,
    })
    setForm({ school_name: saved.school_name, slogan: saved.slogan, app_name: saved.app_name })
    setTouched(false)
    setLogoFile(null)
    setRemoveLogo(false)
    setNotice(
      isApp
        ? 'Identitas yayasan disimpan dan langsung tampil di halaman login.'
        : 'Identitas sekolah disimpan dan langsung tampil di semua halaman.',
    )
  })

  // Logo tersimpan; sekolah tanpa logo memakai logo yayasan. null = logo bawaan (placeholder).
  const savedLogo = branding.logo_url ?? (isApp ? null : app.logo_url)
  const logoSrc = removeLogo
    ? isApp
      ? null
      : app.logo_url && apiUrl(app.logo_url)
    : (preview ?? (savedLogo ? apiUrl(savedLogo) : null))
  const hasCustomLogo = !removeLogo && (Boolean(logoFile) || Boolean(branding.logo_url))

  return (
    <>
      <PageHeader
        title={isApp ? 'Identitas Yayasan' : 'Identitas Sekolah'}
        description={
          isApp
            ? 'Nama, slogan, dan logo yayasan tampil di halaman login; nama aplikasi menjadi judul tab. Logo yayasan juga dipakai sekolah yang belum mengunggah logo.'
            : 'Atur nama, slogan, dan logo sekolah ini. Tampil di header dan Beranda saat sekolah ini dibuka.'
        }
      />
      <Alert type="success" className="mb-4">
        {notice}
      </Alert>
      <Alert type="error" className="mb-4">
        {generalError}
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <form
          onSubmit={submit}
          className="space-y-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
        >
          <section>
            <h2 className="font-semibold text-slate-900">Logo</h2>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <span className="flex size-24 items-center justify-center rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200">
                <SchoolLogo className="size-20" src={logoSrc} />
              </span>
              <div className="space-y-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    pickLogo(event.target.files[0])
                    event.target.value = ''
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                    <ImageUp className="size-4" aria-hidden="true" /> Pilih Logo Baru
                  </Button>
                  {hasCustomLogo && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setLogoFile(null)
                        setRemoveLogo(Boolean(branding.logo_url))
                        setNotice('')
                      }}
                    >
                      <RotateCcw className="size-4" aria-hidden="true" />{' '}
                      {isApp ? 'Pakai Logo Bawaan' : 'Pakai Logo Yayasan'}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  PNG, JPG, WEBP, atau GIF, maks. {MAX_LOGO_MB} MB. Sebaiknya persegi dengan latar
                  transparan. SVG tidak diterima demi keamanan.
                </p>
                {logoFile && (
                  <p className="text-xs text-sky-700">
                    Logo baru: {logoFile.name} (belum disimpan)
                  </p>
                )}
                {removeLogo && (
                  <p className="text-xs text-amber-700">
                    Logo akan kembali ke logo {isApp ? 'bawaan' : 'yayasan'} setelah disimpan.
                  </p>
                )}
                {(fileError || errors.logo) && (
                  <p className="text-xs text-red-600">{fileError || errors.logo}</p>
                )}
              </div>
            </div>
          </section>

          <TextField
            label={isApp ? 'Nama yayasan' : 'Nama sekolah'}
            value={shown.school_name}
            onChange={(event) => update('school_name', event.target.value)}
            error={errors.school_name || errors.name}
            maxLength={100}
            hint={isApp ? 'Tampil di halaman login.' : 'Tampil di header dan menu.'}
            required
          />
          <TextField
            label="Slogan"
            value={shown.slogan}
            onChange={(event) => update('slogan', event.target.value)}
            error={errors.slogan}
            maxLength={150}
            hint="Opsional. Tampil di bawah nama sekolah."
          />
          {isApp && (
            <TextField
              label="Nama aplikasi"
              value={shown.app_name}
              onChange={(event) => update('app_name', event.target.value)}
              error={errors.app_name}
              maxLength={100}
              hint="Tampil sebagai judul tab browser, mis. “LMS Nurul Jadid”."
              required
            />
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" loading={submitting}>
              <Save className="size-4" aria-hidden="true" /> Simpan Perubahan
            </Button>
          </div>
        </form>

        <aside className="space-y-5">
          {!isApp && (
            <PreviewCard title="Pratinjau header">
              <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <SchoolLogo className="size-10 shrink-0" src={logoSrc} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold text-slate-900">
                    {shown.school_name || 'Nama sekolah'}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{shown.slogan}</span>
                </span>
                <Bell className="size-5 text-slate-400" aria-hidden="true" />
              </div>
            </PreviewCard>
          )}
          {isApp && (
            <>
              <PreviewCard title="Pratinjau halaman login">
                <div className="rounded-xl bg-surface p-5 ring-1 ring-slate-200">
                  <div className="rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
                    <SchoolLogo className="mx-auto mb-3 size-16" src={logoSrc} />
                    <p className="text-xl font-extrabold text-slate-900">
                      {shown.school_name || 'Nama sekolah'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{shown.slogan}</p>
                    <div className="mt-4 space-y-2" aria-hidden="true">
                      <div className="h-9 rounded-lg bg-slate-100" />
                      <div className="h-9 rounded-lg bg-slate-100" />
                      <div className="h-9 rounded-lg bg-brand-600" />
                    </div>
                  </div>
                </div>
              </PreviewCard>
              <PreviewCard title="Pratinjau tab browser">
                <div className="flex items-center gap-2 rounded-t-lg bg-slate-200 px-3 py-2 text-sm text-slate-700">
                  <SchoolLogo className="size-4 shrink-0" src={logoSrc} />
                  <span className="truncate">{shown.app_name || 'Nama aplikasi'}</span>
                </div>
              </PreviewCard>
            </>
          )}
        </aside>
      </div>
    </>
  )
}
