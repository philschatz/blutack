import React, { useState, useEffect } from 'react'
// import Fs from 'fs'
// import Os from 'os'
import * as ContentTypes from '../../pushpin-code/ContentTypes'
import { PushpinUrl } from '../../pushpin-code/ShareLink'
import { ContentProps } from '../../Content'
import { DocumentId, useDocument } from 'automerge-repo-react-hooks'
import Badge from '../../ui/Badge'
import './Device.css'
// import { useDeviceOnlineStatus } from '../../../PresenceHooks'
import TitleWithSubtitle from '../../ui/TitleWithSubtitle'
import { DocHandle } from 'automerge-repo'

export interface DeviceDoc {
  icon: string // fa-icon name
  name: string
}

interface Props extends ContentProps {
  editable: boolean
}

function Device(props: Props) {
  const [doc] = useDocument<DeviceDoc>(props.documentId)
  const isOnline = false // useDeviceOnlineStatus(props.documentId)
  if (!doc) return null
  const { icon = 'desktop', name } = doc

  switch (props.context) {
    case 'title-bar':
      return (
        <div className={isOnline ? 'Device Device--online' : 'Device Device--offline'}>
          <Badge
            icon={doc.icon || 'desktop'}
            shape="circle"
            size="large"
            backgroundColor={`var(${isOnline ? '--colorOnline' : '--colorOffline'})`}
          />
        </div>
      )
    default:
      return (
        <div className={isOnline ? 'DeviceListItem DeviceListItem--online' : 'DeviceListItem'}>
          <div className="DeviceListItem-badge">
            <Badge
              icon={icon}
              shape="circle"
              backgroundColor={`var(${isOnline ? '--colorOnline' : '--colorOffline'})`}
            />
          </div>
          <TitleWithSubtitle
            title={name}
            titleEditorField="name"
            editable={props.editable}
            documentId={props.documentId}
          />
        </div>
      )
  }
}

function create(deviceAttrs: any, handle: DocHandle<any>) {
  ;(navigator as any).getBattery().then((b: any) => {
    const isLaptop = b.chargingTime !== 0
    const icon = isLaptop ? 'laptop' : 'desktop'
    handle.change((doc: DeviceDoc) => {
      doc.name = "computer" // Os.hostname()
      doc.icon = icon
    })
  })
}

ContentTypes.register({
  type: 'device',
  name: 'Device',
  icon: 'desktop',
  contexts: {
    list: Device,
    'title-bar': Device,
    contact: Device,
    board: Device,
  },
  resizable: false,
  unlisted: true,
  create,
})

export const CurrentDeviceContext = React.createContext<DocumentId | null>(null)
