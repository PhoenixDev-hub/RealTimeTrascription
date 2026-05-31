import type { HTMLAttributes } from 'react'
import { useCallback, useEffect, useRef } from 'react'

type VLibrasProps = {
  text: string
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
const TRANSLATE_DELAY_MS = 220
const READY_RETRY_MS = 300
const MAX_TRANSLATE_ATTEMPTS = 24
const CENTER_WIDGET_DELAY_MS = 250
const MIN_TRANSLATION_MS = 1400
const MAX_TRANSLATION_MS = 9000
const MS_PER_CHARACTER = 38
const DEFAULT_SPEED = 2
const DEFAULT_SPEED_LABEL = 'x3'
const SPEED_RETRY_MS = 350
const SPEED_RETRY_COUNT = 12

function setImportant(element: HTMLElement, property: string, value: string) {
  element.style.setProperty(property, value, 'important')
}

export default function VLibras({ text }: VLibrasProps) {
  const initialized = useRef(false)
  const readyTimer = useRef<number | null>(null)
  const speedTimer = useRef<number | null>(null)
  const speedAttempts = useRef(0)
  const translating = useRef(false)
  const queue = useRef<string[]>([])
  const lastQueuedText = useRef('')
  const translateTimer = useRef<number | null>(null)
  const translateNextRef = useRef<() => boolean>(() => true)

  const estimateTranslationTime = useCallback((value: string) => {
    const words = value.split(/\s+/).filter(Boolean).length
    const textTime = value.length * MS_PER_CHARACTER
    const wordTime = words * 240
    return Math.min(MAX_TRANSLATION_MS, Math.max(MIN_TRANSLATION_MS, textTime + wordTime))
  }, [])

  const centerWidget = useCallback(() => {
    const root = document.querySelector<HTMLElement>('[vw].enabled')
    const accessButton = document.querySelector<HTMLElement>('[vw-access-button]')
    const wrapper = document.querySelector<HTMLElement>('[vw-plugin-wrapper]')
    const widgetHeight = window.innerHeight <= 700 ? '358px' : '454px'
    const widgetTop = window.innerHeight <= 700 ? '45%' : '50%'

    if (root) {
      setImportant(root, 'position', 'fixed')
      setImportant(root, 'top', widgetTop)
      setImportant(root, 'right', 'auto')
      setImportant(root, 'bottom', 'auto')
      setImportant(root, 'left', '50%')
      setImportant(root, 'width', '316px')
      setImportant(root, 'height', widgetHeight)
      setImportant(root, 'min-width', '316px')
      setImportant(root, 'min-height', widgetHeight)
      setImportant(root, 'max-width', '92vw')
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
      setImportant(wrapper, 'width', '316px')
      setImportant(wrapper, 'height', widgetHeight)
      setImportant(wrapper, 'min-height', widgetHeight)
      setImportant(wrapper, 'max-width', '100%')
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
      .querySelectorAll<HTMLElement>('.emscripten, #canvas, [vw-plugin-wrapper]')
      .forEach((element) => {
        setImportant(element, 'background-color', 'transparent')
      })

    const canvas = document.querySelector<HTMLElement>('#canvas')

    if (canvas) {
      setImportant(canvas, 'max-width', '100%')
    }
  }, [])

  const applyDefaultSpeed = useCallback(() => {
    let apiSpeedApplied: boolean

    try {
      window.VLibrasPlayer?.setSpeed?.(DEFAULT_SPEED)
      window.plugin?.setSpeed?.(DEFAULT_SPEED)
      apiSpeedApplied = Boolean(window.VLibrasPlayer || window.plugin?.setSpeed)
    } catch {
      apiSpeedApplied = false
    }

    const speedLabel = document.querySelector<HTMLElement>('.vpw-speed-default')

    if (speedLabel?.textContent?.trim() === DEFAULT_SPEED_LABEL) {
      return true
    }

    document.querySelector<HTMLElement>('.vpw-button-speed')?.click()

    const fastOption =
      document.querySelector<HTMLElement>('.vpw-block-speed-3')
      ?? [...document.querySelectorAll<HTMLElement>('.vpw-block-speed')]
        .find((option) => option.textContent?.trim() === DEFAULT_SPEED_LABEL)

    fastOption?.click()

    if (speedLabel) {
      speedLabel.textContent = DEFAULT_SPEED_LABEL
    }

    return Boolean(fastOption || apiSpeedApplied)
  }, [])

  const scheduleDefaultSpeed = useCallback(() => {
    if (speedTimer.current) {
      window.clearTimeout(speedTimer.current)
    }

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
    if (!window.VLibras) {
      return false
    }

    if (!window.__vlibrasWidgetStarted) {
      new window.VLibras.Widget('https://vlibras.gov.br/app')
      window.__vlibrasWidgetStarted = true
    }

    const widgetMounted = Boolean(
      document.querySelector('[vw-access-button] .vp-access-button')
      && document.querySelector('[vw-plugin-wrapper] [vp]'),
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

    if (!accessButton || !wrapper) {
      return false
    }

    if (!wrapper.classList.contains('active')) {
      accessButton.click()
    }

    window.setTimeout(centerWidget, CENTER_WIDGET_DELAY_MS)
    window.setTimeout(scheduleDefaultSpeed, CENTER_WIDGET_DELAY_MS)
    return true
  }, [bootWidget, centerWidget, scheduleDefaultSpeed])

  const translateNext = useCallback(
    () => {
      if (translating.current) {
        return true
      }

      const nextText = queue.current.shift()

      if (!nextText) {
        return true
      }

      if (!openWidget() || typeof window.plugin?.translate !== 'function') {
        queue.current.unshift(nextText)
        return false
      }

      translating.current = true
      applyDefaultSpeed()
      window.plugin.translate(nextText)
      centerWidget()

      if (translateTimer.current) {
        window.clearTimeout(translateTimer.current)
      }

      translateTimer.current = window.setTimeout(() => {
        translating.current = false
        translateTimer.current = null
        translateNextRef.current()
      }, estimateTranslationTime(nextText))

      return true
    },
    [applyDefaultSpeed, centerWidget, estimateTranslationTime, openWidget],
  )

  useEffect(() => {
    translateNextRef.current = translateNext
  }, [translateNext])

  const enqueueTranslation = useCallback(
    (textoAtual: string) => {
      if (!textoAtual) {
        return false
      }

      if (textoAtual === lastQueuedText.current) {
        return translateNext()
      }

      lastQueuedText.current = textoAtual
      queue.current.push(textoAtual)
      return translateNext()
    },
    [translateNext],
  )

  const triggerTranslation = useCallback(() => {
    const textoAtual = text.trim()

    if (!textoAtual) {
      return false
    }

    return enqueueTranslation(textoAtual)
  }, [enqueueTranslation, text])

  useEffect(() => {
    if (initialized.current) {
      return
    }

    initialized.current = true

    const startWidget = () => {
      if (!window.VLibras) {
        return
      }

      bootWidget()
      readyTimer.current = window.setTimeout(openWidget, 1600)
      window.setTimeout(centerWidget, 2200)
      window.setTimeout(scheduleDefaultSpeed, 2400)
    }

    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

    if (existingScript) {
      startWidget()
    } else {
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.onload = startWidget
      script.onerror = () => {
        console.error('Não foi possível carregar o script do VLibras.')
      }

      document.head.appendChild(script)
    }

    return () => {
      if (readyTimer.current) {
        window.clearTimeout(readyTimer.current)
      }

      if (translateTimer.current) {
        window.clearTimeout(translateTimer.current)
      }

      if (speedTimer.current) {
        window.clearTimeout(speedTimer.current)
      }
    }
  }, [bootWidget, centerWidget, openWidget, scheduleDefaultSpeed])

  useEffect(() => {
    const textoAtual = text.trim()

    if (!textoAtual || textoAtual === lastQueuedText.current) {
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

    return () => {
      window.clearTimeout(timer)
    }
  }, [text, triggerTranslation])

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
