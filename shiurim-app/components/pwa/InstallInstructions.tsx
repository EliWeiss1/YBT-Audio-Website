'use client'

import Image from 'next/image'
import type { InstallPlatform } from '@/lib/pwa-install-logic'

/** Manual "Add to Home Screen" instructions, shown when no native install
 *  prompt is available (iOS Safari, or a browser that hasn't offered one). */
export default function InstallInstructions({
  platform,
  onClose,
}: {
  platform: InstallPlatform
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white border border-stone-200 shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            className="rounded-xl border border-stone-100 shrink-0"
            unoptimized
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-900 leading-tight">
              Add YBT Shiurim to your home screen
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              Full screen, with offline downloads.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 -m-1 rounded-lg text-stone-300 hover:text-stone-500 hover:bg-stone-50 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ol className="mt-4 space-y-2.5 text-sm text-stone-600">
          {platform === 'ios' ? (
            <>
              <li className="flex items-center gap-2.5">
                <Step n={1} />
                <span>
                  Tap the{' '}
                  <svg className="inline w-4 h-4 -mt-0.5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0-12L8 7m4-4l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>{' '}
                  <span className="font-medium text-stone-800">Share</span> button in Safari&apos;s toolbar.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Step n={2} />
                <span>Scroll down and tap <span className="font-medium text-stone-800">&ldquo;Add to Home Screen&rdquo;</span>.</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Step n={3} />
                <span>Tap <span className="font-medium text-stone-800">Add</span> — the app appears on your home screen.</span>
              </li>
            </>
          ) : (
            <>
              <li className="flex items-center gap-2.5">
                <Step n={1} />
                <span>Open your browser menu (<span className="font-medium text-stone-800">⋮</span>).</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Step n={2} />
                <span>Tap <span className="font-medium text-stone-800">&ldquo;Install app&rdquo;</span> or <span className="font-medium text-stone-800">&ldquo;Add to Home screen&rdquo;</span>.</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Step n={3} />
                <span>Confirm to install it with offline downloads.</span>
              </li>
            </>
          )}
        </ol>

        <button
          onClick={onClose}
          className="mt-5 w-full py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-sm font-medium text-stone-700 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold flex items-center justify-center">
      {n}
    </span>
  )
}
