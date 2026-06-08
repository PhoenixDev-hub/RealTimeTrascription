import type { HTMLAttributes } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

type VLibrasProps = {
  text: string
  onStatusChange?: (status: 'idle' | 'loading' | 'translating' | 'error' | 'ready') => void
}

type VLibrasElementProps = HTMLAttributes<HTMLDivElement> & {
  vw?: string
  'vw-access-button'?: string
  'vw-plugin-wrapper'?: string
}

declare global {
  interface Window {
    VLibras?: {
      Widget: new (url: string) => unknown
    }
    plugin?: {
      translate?: (text: string) => void
      player?: {
        setSpeed?: (speed: number) => void
      }
      setSpeed?: (speed: number) => void
    }
    VLibrasPlayer?: {
      setSpeed?: (speed: number) => void
    }
    __vlibrasWidgetStarted?: boolean
    __vlibrasWidgetBooted?: boolean
  }
}

const SCRIPT_ID = 'vlibras-widget-script'
const SCRIPT_SRC = 'https://vlibras.gov.br/app/vlibras-plugin.js'
const TRANSLATE_DELAY_MS = 300
const READY_RETRY_MS = 200
const MAX_TRANSLATE_ATTEMPTS = 30
const CENTER_WIDGET_DELAY_MS = 300
const MIN_TRANSLATION_MS = 2000
const MAX_TRANSLATION_MS = 12000
const MS_PER_CHARACTER = 45
const DEFAULT_SPEED = 2
const SPEED_RETRY_MS = 300
const SPEED_RETRY_COUNT = 15

function setImportant(element: HTMLElement, property: string, value: string) {
  element.style.setProperty(property, value, 'important')
}

export default function VLibras({ text, onStatusChange }: VLibrasProps) {
  const initialized = useRef(false)
  const widgetReady = useRef(false)
  const readyTimer = useRef<number | null>(null)
  const speedTimer = useRef<number | null>(null)
  const speedAttempts = useRef(0)
  const translating = useRef(false)
  const queue = useRef<string[]>([])
  const lastQueuedText = useRef('')
  const translateTimer = useRef<number | null>(null)
  const translateNextRef = useRef<() => boolean>(() => true)
  const [status, setStatus] = useState<'idle' | 'loading' | 'translating' | 'error' | 'ready'>('idle')

  useEffect(() => {
    console.debug('[VLibras] Status:', status)
  }, [status])

  const estimateTranslationTime = useCallback((value: string) => {
    const words = value.split(/\s+/).filter(Boolean).length
    const textTime = value.length * MS_PER_CHARACTER
    const wordTime = words * 300
    return Math.min(MAX_TRANSLATION_MS, Math.max(MIN_TRANSLATION_MS, textTime + wordTime))
  }, [])

  const centerWidget = useCallback(() => {
    const root = document.querySelector<HTMLElement>('[vw].enabled')
    const accessButton = document.querySelector<HTMLElement>('[vw-access-button]')
    const wrapper = document.querySelector<HTMLElement>('[vw-plugin-wrapper]')
    const widgetWidth = window.innerWidth <= 640 ? '360px' : '430px'
    const widgetHeight = window.innerHeight <= 700 ? '430px' : '610px'
    const widgetTop = window.innerHeight <= 700 ? '46%' : '48%'

    if (root) {
      setImportant(root, 'position', 'fixed')
      setImportant(root, 'top', widgetTop)
      setImportant(root, 'right', 'auto')
      setImportant(root, 'bottom', 'auto')
      setImportant(root, 'left', '50%')
      setImportant(root, 'width', widgetWidth)
      setImportant(root, 'height', widgetHeight)
      setImportant(root, 'min-width', widgetWidth)
      setImportant(root, 'min-height', widgetHeight)
      setImportant(root, 'max-width', '96vw')
      setImportant(root, 'background', 'transparent')
      setImportant(root, 'background-color', 'transparent')
      setImportant(root, 'transform', 'translate(-50%, -50%)')
      setImportant(root, 'margin-top', '0')
      setImportant(root, 'z-index', '2147483646')
      setImportant(root, 'pointer-events', 'auto')
    }

    if (accessButton) {
      setImportant(accessButton, 'position', 'fixed')
      setImportant(accessButton, 'right', '18px')
      setImportant(accessButton, 'bottom', '18px')
      setImportant(accessButton, 'z-index', '999999')
      setImportant(accessButton, 'pointer-events', 'auto')
      setImportant(accessButton, 'display', 'none')
    }

    if (wrapper) {
      setImportant(wrapper, 'width', widgetWidth)
      setImportant(wrapper, 'height', widgetHeight)
      setImportant(wrapper, 'min-height', widgetHeight)
      setImportant(wrapper, 'max-width', '100%')
      setImportant(wrapper, 'background', 'transparent')
      setImportant(wrapper, 'background-color', 'transparent')
      setImportant(wrapper, 'z-index', '2147483646')
      setImportant(wrapper, 'pointer-events', 'auto')
    }

    document
      .querySelectorAll<HTMLElement>(
        '.vpw-box, .vpw-controls, .vpw-subtitles, .vpw-playing, .vpw-message-box, .vp-rate-box-content, .vp-rate-box-header, .vp-enabled, .vp-button-change-avatar, .avatar-icaro, .vp-selected',
      )
      .forEach((element) => {
        setImportant(element, 'display', 'none')
      })

    document
      .querySelectorAll<HTMLElement>(
        '[vp], .vpw, .vpw-wrapper, .vpw-container, .vpw-main, .vpw-player, .vpw-avatar, .vpw-canvas, .emscripten, #canvas, [vw], [vw-plugin-wrapper]',
      )
      .forEach((element) => {
        setImportant(element, 'box-shadow', 'none')
        setImportant(element, 'border', '0')
        setImportant(element, 'background', 'transparent')
        setImportant(element, 'background-color', 'transparent')
      })

    const canvas = document.querySelector<HTMLElement>('#canvas')
    if (canvas) {
      setImportant(canvas, 'width', '100%')
      setImportant(canvas, 'height', '100%')
      setImportant(canvas, 'max-width', '100%')
      setImportant(canvas, 'background', 'transparent')
      setImportant(canvas, 'background-color', 'transparent')
    }
  }, [])

  const applyDefaultSpeed = useCallback(() => {
    try {
      window.VLibrasPlayer?.setSpeed?.(DEFAULT_SPEED)
      window.plugin?.setSpeed?.(DEFAULT_SPEED)
    } catch {
      // Ignore errors when setting speed
    }
    return true
  }, [])

  const scheduleDefaultSpeed = useCallback(() => {
    if (speedTimer.current) window.clearTimeout(speedTimer.current)
    speedAttempts.current = 0

    const run = () => {
      speedAttempts.current += 1
      if (applyDefaultSpeed() || speedAttempts.current >= SPEED_RETRY_COUNT) {
        speedTimer.current = null
        return
      }
      speedTimer.current = window.setTimeout(run, SPEED_RETRY_MS)
    }
    run()
  }, [applyDefaultSpeed])

  const bootWidget = useCallback(() => {
    if (!window.VLibras) return false

    if (!window.__vlibrasWidgetStarted) {
      new window.VLibras.Widget('https://vlibras.gov.br/app')
      window.__vlibrasWidgetStarted = true
    }

    const widgetMounted = Boolean(
      document.querySelector('[vw-access-button] .vp-access-button') &&
      document.querySelector('[vw-plugin-wrapper] [vp]')
    )

    if (!widgetMounted && !window.__vlibrasWidgetBooted && typeof window.onload === 'function') {
      window.__vlibrasWidgetBooted = true
      window.onload.call(window, new Event('load'))
    }

    scheduleDefaultSpeed()
    return true
  }, [scheduleDefaultSpeed])

  const openWidget = useCallback(() => {
    bootWidget()
    const accessButton = document.querySelector<HTMLElement>('[vw-access-button]')
    const wrapper = document.querySelector<HTMLElement>('[vw-plugin-wrapper]')

    if (!accessButton || !wrapper) return false

    if (!wrapper.classList.contains('active')) {
      accessButton.click()
    }

    window.setTimeout(centerWidget, CENTER_WIDGET_DELAY_MS)
    window.setTimeout(scheduleDefaultSpeed, CENTER_WIDGET_DELAY_MS)
    return true
  }, [bootWidget, centerWidget, scheduleDefaultSpeed])
  const waitForPlugin = useCallback(function waitForPlugin(callback: () => void, attempts = 0) {
    if (attempts >= 40) {
      onStatusChange?.('error')
      return
    }

    if (typeof window.plugin?.translate === 'function' && document.querySelector('[vp]')) {
      widgetReady.current = true
      setStatus('ready')
      onStatusChange?.('ready')
      callback()
    } else {
      setTimeout(() => waitForPlugin(callback, attempts + 1), 150)
    }
  }, [onStatusChange])
  const translateNext = useCallback(() => {
    if (translating.current) return true

    const nextText = queue.current.shift()
    if (!nextText) return true

    if (!widgetReady.current || typeof window.plugin?.translate !== 'function') {
      queue.current.unshift(nextText)
      onStatusChange?.('error')
      return false
    }

    if (!openWidget()) {
      queue.current.unshift(nextText)
      onStatusChange?.('error')
      return false
    }

    translating.current = true
    onStatusChange?.('translating')
    setStatus('translating')

    applyDefaultSpeed()
    window.plugin.translate!(nextText)
    centerWidget()

    if (translateTimer.current) window.clearTimeout(translateTimer.current)

    translateTimer.current = window.setTimeout(() => {
      translating.current = false
      translateTimer.current = null
      onStatusChange?.('idle')
      translateNextRef.current()
    }, estimateTranslationTime(nextText))

    return true
  }, [applyDefaultSpeed, centerWidget, estimateTranslationTime, openWidget, onStatusChange])

  useEffect(() => {
    translateNextRef.current = translateNext
  }, [translateNext])

  const enqueueTranslation = useCallback((textoAtual: string) => {
    if (!textoAtual?.trim()) return false

    if (textoAtual === lastQueuedText.current && widgetReady.current) {
      return translateNext()
    }

    lastQueuedText.current = textoAtual
    queue.current.push(textoAtual.trim())
    return translateNext()
  }, [translateNext])

  const triggerTranslation = useCallback(() => {
    const textoAtual = text.trim()
    if (!textoAtual) return false
    return enqueueTranslation(textoAtual)
  }, [enqueueTranslation, text])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    setStatus('loading')
    onStatusChange?.('loading')

    const startWidget = () => {
      if (!window.VLibras) return

      bootWidget()

      waitForPlugin(() => {
        if (queue.current.length > 0) {
          translateNextRef.current()
        }
      })

      readyTimer.current = window.setTimeout(() => {
        openWidget()
        centerWidget()
        scheduleDefaultSpeed()
      }, 1200)
    }

    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

    if (existingScript && existingScript.getAttribute('data-loaded') === 'true') {
      startWidget()
    } else {
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.setAttribute('data-loaded', 'true')

      script.onload = () => {
        startWidget()
      }
      script.onerror = () => {
        setStatus('error')
        onStatusChange?.('error')
      }

      document.head.appendChild(script)
    }

    return () => {
      if (readyTimer.current) window.clearTimeout(readyTimer.current)
      if (translateTimer.current) window.clearTimeout(translateTimer.current)
      if (speedTimer.current) window.clearTimeout(speedTimer.current)
    }
  }, [bootWidget, centerWidget, openWidget, scheduleDefaultSpeed, waitForPlugin, onStatusChange])

  useEffect(() => {
    const textoAtual = text.trim()
    if (!textoAtual) return

    if (!widgetReady.current) {
      enqueueTranslation(textoAtual)
      return
    }

    let attempt = 0
    let timer: number

    const runTranslation = () => {
      attempt += 1
      if (triggerTranslation() || attempt >= MAX_TRANSLATE_ATTEMPTS) {
        return
      }
      timer = window.setTimeout(runTranslation, READY_RETRY_MS)
    }

    timer = window.setTimeout(runTranslation, TRANSLATE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text, triggerTranslation, enqueueTranslation])

  const rootProps: VLibrasElementProps = {
    vw: ' ',
    className: 'enabled',
  }

  const accessButtonProps: VLibrasElementProps = {
    'vw-access-button': ' ',
    className: 'active',
  }

  const wrapperProps: VLibrasElementProps = {
    'vw-plugin-wrapper': ' ',
  }

  return (
    <div {...rootProps}>
      <div {...accessButtonProps} />
      <div {...wrapperProps}>
        <div className="vw-plugin-top-wrapper" />
      </div>
    </div>
  )
}
