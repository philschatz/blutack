import React, { useState, useEffect } from 'react'
import { DocumentId } from 'automerge-repo'
import { useDocument } from 'automerge-repo-react-hooks'


import Omnibox from './omnibox/Omnibox'
import Content from '../../Content'
import Authors from './Authors'
import { PushpinUrl, createDocumentLink, createWebLink } from '../../pushpin-code/ShareLink'
import { useEvent } from '../../pushpin-code/Hooks'

import './TitleBar.css'
import { WorkspaceDoc as WorkspaceDoc } from './Workspace'
import Badge from '../../ui/Badge'

export interface Props {
  documentId: DocumentId
  openDoc: Function
  onContent: (url: PushpinUrl) => boolean
}

export default function TitleBar(props: Props) {
  const [sessionHistory, setHistory] = useState<PushpinUrl[]>([])
  const [historyIndex, setIndex] = useState(0)
  const [activeOmnibox, setActive] = useState(false)
  const [doc] = useDocument<WorkspaceDoc>(props.documentId)

  useEvent(document, 'keydown', (e) => {
    if (e.key === '/' && document.activeElement === document.body) {
      if (!activeOmnibox) {
        showOmnibox()
        e.preventDefault()
      }
    }

    if (e.key === 'Escape' && activeOmnibox) {
      hideOmnibox()
      e.preventDefault()
    }
  })

  const backDisabled = historyIndex === sessionHistory.length - 1
  const forwardDisabled = historyIndex === 0

  useEffect(() => {
    if (!doc || !doc.currentDocUrl) {
      return
    }

    // Init sessionHistory
    if (sessionHistory.length === 0) {
      setHistory([doc.currentDocUrl])
      // If we're opening a new document (as opposed to going back or forward),
      // add it to our sessionHistory and remove all docs 'forward' of the current index
    } else if (doc.currentDocUrl !== sessionHistory[historyIndex]) {
      setHistory([doc.currentDocUrl, ...sessionHistory.slice(historyIndex)])
      setIndex(0)
    }
  }, [doc, historyIndex, sessionHistory])

  function goBack() {
    if (backDisabled) {
      throw new Error('Can not go back further than session history')
    }
    const newIndex = historyIndex + 1
    props.openDoc(sessionHistory[newIndex])
    setIndex(newIndex)
  }

  function goForward() {
    if (forwardDisabled) {
      throw new Error('Can not go forward past session history')
    }
    const newIndex = historyIndex - 1
    props.openDoc(sessionHistory[newIndex])
    setIndex(newIndex)
  }

  function copyLink(e: React.MouseEvent) {
    if (doc && doc.currentDocUrl) {
      navigator.clipboard.writeText(createWebLink(window.location, doc.currentDocUrl))
    }
  }

  function showOmnibox() {
    setActive(true)
  }

  function hideOmnibox() {
    setActive(false)
  }

  if (!doc || !doc.currentDocUrl) {
    return null
  }

  return (
    <div className="TitleBar">
      <div className="NavigationBar Inline">
        <button
          disabled={backDisabled}
          type="button"
          onClick={goBack}
          className="TitleBar-menuItem"
        >
          <i className="fa fa-angle-left" />
        </button>
        <button type="button" onClick={(e) => { showOmnibox(); e.stopPropagation()}} className="TitleBar-menuItem">
          <Badge icon="search" backgroundColor="#00000000" />
        </button>

        <button
          disabled={forwardDisabled}
          type="button"
          onClick={goForward}
          className="TitleBar-menuItem"
        >
          <i className="fa fa-angle-right" />
        </button>
      </div>

      <div className="ContentHeader Group">
        <Content url={doc.currentDocUrl} context="title-bar" editable />
      </div>
      <div className="CollaboratorsBar Inline">
        <Authors currentDocUrl={doc.currentDocUrl} workspaceDocId={props.documentId} />
        <div className="TitleBar-self">
          <Content url={createDocumentLink('contact', doc.selfId)} context="title-bar" isPresent />
        </div>
      </div>
      <button
        className="BoardTitle__clipboard BoardTitle__labeledIcon TitleBar-menuItem"
        type="button"
        onClick={copyLink}
      >
        <i className="fa fa-clipboard" />
      </button>
      <Omnibox
            active={activeOmnibox}
            documentId={props.documentId}
            omniboxFinished={hideOmnibox}
            onContent={props.onContent}
        />

    </div>
  )
}
