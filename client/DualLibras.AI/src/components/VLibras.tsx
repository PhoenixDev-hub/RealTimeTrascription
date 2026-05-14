import type { HTMLAttributes } from 'react'
import { useEffect, useRef } from 'react'

type VLibrasProps = {
  text: string
  targetId: string
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
    __vlibrasWidgetStarted?: boolean
  }
}

const SCRIPT_ID = 'vlibras-widget-script'
const SCRIPT_SRC = 'https://vlibras.gov.br/app/vlibras-plugin.js'

export default function VLibras({ text, targetId }: VLibrasProps) {
  const initialized = useRef(false)
  const opened = useRef(false)
  const lastTriggeredText = useRef('')

  const openWidget = () => {
    if (opened.current) {
      return
    }

    const accessButton = document.querySelector<HTMLElement>('[vw-access-button]')

    if (!accessButton) {
      return
    }

    accessButton.click()
    opened.current = true
  }

  useEffect(() => {
    if (initialized.current) {
      return
    }

    initialized.current = true

    const startWidget = () => {
      if (!window.VLibras || window.__vlibrasWidgetStarted) {
        return
      }

      new window.VLibras.Widget('https://vlibras.gov.br/app')
      window.__vlibrasWidgetStarted = true
      window.setTimeout(openWidget, 900)
    }

    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

    if (existingScript) {
      startWidget()
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = startWidget
    script.onerror = () => {
      console.error('Não foi possível carregar o script do VLibras.')
    }

    document.body.appendChild(script)
  }, [])

  useEffect(() => {
    const textoAtual = text.trim()

    if (!textoAtual) {
      return
    }

    lastTriggeredText.current = textoAtual

    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetId)

      if (!target) {
        return
      }

      openWidget()

      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(target)
      selection?.removeAllRanges()
      selection?.addRange(range)

      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [targetId, text])

  const rootProps: VLibrasElementProps = {
    vw: 'true',
    className: 'enabled',
  }

  const accessButtonProps: VLibrasElementProps = {
    'vw-access-button': 'true',
    className: 'active',
  }

  const wrapperProps: VLibrasElementProps = {
    'vw-plugin-wrapper': 'true',
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
