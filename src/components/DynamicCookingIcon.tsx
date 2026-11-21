import { useEffect, useState } from 'react'

type IconType = 'toast' | 'coffee' | 'pan' | 'chef' | 'clock'

const ICONS: IconType[] = ['toast', 'coffee', 'pan', 'chef', 'clock']

export function DynamicCookingIcon({ className = '' }: { className?: string }) {
  const [currentIcon, setCurrentIcon] = useState<IconType>(() => {
    // İlk açılışta rastgele bir ikonla başla
    const idx = Math.floor(Math.random() * ICONS.length)
    return ICONS[idx]
  })
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    let timer: number

    const scheduleNext = () => {
      // Her ~5 saniyede bir (4.2s - 5.8s rastgele aralıklarla)
      const delay = 4200 + Math.random() * 1600
      timer = window.setTimeout(() => {
        // Yumuşak fade-out
        setOpacity(0)
        setTimeout(() => {
          setCurrentIcon((prev) => {
            let next: IconType
            do {
              next = ICONS[Math.floor(Math.random() * ICONS.length)]
            } while (next === prev)
            return next
          })
          // Yumuşak fade-in
          setOpacity(1)
          scheduleNext()
        }, 220)
      }, delay)
    }

    scheduleNext()

    return () => {
      clearTimeout(timer)
    }
  }, [])

  return (
    <div
      className={`canteen-icon-wrapper ${className}`}
      style={{
        opacity,
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        transform: opacity === 1 ? 'scale(1)' : 'scale(0.85)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        className="canteen-cooking-icon"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {currentIcon === 'toast' && (
          <g className="icon-toast-group">
            {/* Yükselen Buharlar */}
            <path
              className="steam-line steam-1"
              d="M11 12C11 9.5 13 9.5 13 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              className="steam-line steam-2"
              d="M18 11C18 8.5 20 8.5 20 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              className="steam-line steam-3"
              d="M25 12C25 9.5 27 9.5 27 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />

            {/* Tost / Sandviç Gövdesi */}
            <g className="toast-body">
              <path d="M6 19C6 16.5 8.5 15 18 15C27.5 15 30 16.5 30 19H6Z" fill="currentColor" />
              <path d="M5 22.5H31" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <rect x="6" y="25.5" width="24" height="3.5" rx="1.75" fill="currentColor" />
            </g>
          </g>
        )}

        {currentIcon === 'coffee' && (
          <g className="icon-coffee-group">
            {/* Kahve Buharları */}
            <path
              className="steam-line steam-1"
              d="M13 11C13 8.5 15 8.5 15 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              className="steam-line steam-2"
              d="M19 10C19 7.5 21 7.5 21 5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />

            {/* Kupa Gövdesi */}
            <path
              d="M8 14H24C24 21.5 21 26 16 26C11 26 8 21.5 8 14Z"
              fill="currentColor"
            />
            {/* Kulp */}
            <path
              d="M24 16H27.5C29 16 30 17.5 29.5 19.5C29 21.5 27 23 24 23"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            {/* Tabak / Altlık */}
            <rect x="6" y="28" width="20" height="2.5" rx="1.25" fill="currentColor" />
          </g>
        )}

        {currentIcon === 'pan' && (
          <g className="icon-pan-group">
            {/* Tava Buharı / Cızırtı */}
            <path
              className="steam-line steam-1"
              d="M11 12C11 9.5 13 9.5 13 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              className="steam-line steam-2"
              d="M17 11C17 8.5 19 8.5 19 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />

            {/* Tava Gövdesi */}
            <path
              d="M5 16H23C23 22 20.5 25.5 14 25.5C7.5 25.5 5 22 5 16Z"
              fill="currentColor"
            />
            {/* Tava Sapı */}
            <path
              d="M23 18L32 15"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Cızırdayan Yumurta / Yemek */}
            <circle cx="14" cy="19.5" r="2.2" fill="#2b3236" />
          </g>
        )}

        {currentIcon === 'chef' && (
          <g className="icon-chef-group">
            {/* Aşçı Şapkası Parıltı Yıldızları */}
            <path
              className="steam-line steam-1"
              d="M10 9L11 6L12 9L15 10L12 11L11 14L10 11L7 10L10 9Z"
              fill="currentColor"
            />
            <path
              className="steam-line steam-2"
              d="M24 7L24.8 5L25.6 7L28 7.8L25.6 8.6L24.8 11L24 8.6L21.6 7.8L24 7Z"
              fill="currentColor"
            />

            {/* Şapka Gövdesi */}
            <path
              d="M11 23C7 19.5 7 13.5 12.5 13.5C13.5 11 20.5 11 22 13.5C27 13.5 27 19.5 23 23Z"
              fill="currentColor"
            />
            {/* Şapka Alt Bandı */}
            <rect x="9.5" y="24" width="15" height="4" rx="1.5" fill="currentColor" />
            <path d="M12 25.5H22" stroke="#2b3236" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        )}

        {currentIcon === 'clock' && (
          <g className="icon-clock-group">
            {/* Mutfak Zamanlayıcısı Üst Zili / Kulakları */}
            <path d="M10 9L7.5 11.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M26 9L28.5 11.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M18 6V8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />

            {/* Saat Gövdesi */}
            <circle cx="18" cy="19" r="9" stroke="currentColor" strokeWidth="2.2" fill="currentColor" fillOpacity="0.15" />

            {/* Akrep & Yelkovan (Dönen / Tıklayan Kollar) */}
            <circle cx="18" cy="19" r="1.5" fill="currentColor" />
            <path d="M18 19V13.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M18 19L22.5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

            {/* Ayaklar */}
            <path d="M11.5 27.5L9.5 30" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M24.5 27.5L26.5 30" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  )
}
