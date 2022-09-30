import React from 'react'
// import { Swatch } from 'react-color/lib/components/common'
const Swatch = () => <div>SWATCH</div>

import { createDocumentLink, PushpinUrl } from '../../pushpin-code/ShareLink'

import { DEFAULT_AVATAR_PATH } from '../../constants'
import Content, { ContentProps } from '../../Content'
import { ContactDoc } from '.'
import { FileDoc } from '../files'

import { useDocument } from 'automerge-repo-react-hooks'
import Heading from '../../ui/Heading'
import SecondaryText from '../../ui/SecondaryText'

import ConnectionStatusBadge from './ConnectionStatusBadge'
import Badge from '../../ui/Badge'
import CenteredStack from '../../ui/CenteredStack'
import ListMenuSection from '../../ui/ListMenuSection'
import ListMenuItem from '../../ui/ListMenuItem'
import SharesSection from './SharesSection'

import './ContactEditor.css'
import ListMenu from '../../ui/ListMenu'

export default function ContactViewer(props: ContentProps) {
  const { documentId: contactId } = props
  const [doc] = useDocument<ContactDoc>(contactId)
  const [avatarImageDoc] = useDocument<FileDoc>(doc.avatarDocId)
  const avatarImageUrl = avatarImageDoc ? avatarImageDoc.avatarHyperfileUrl : DEFAULT_AVATAR_PATH

  if (!doc) {
    return null
  }
  const { devices, invites } = doc

  return (
    <CenteredStack centerText={false}>
      <ListMenu>
        <ListMenuSection title="Display Name">
          <ListMenuItem>
            <Heading>{doc.name}</Heading>
          </ListMenuItem>
        </ListMenuSection>
        <ListMenuSection title="Avatar">
          <ListMenuItem>
            <Badge img={avatarImageUrl} />
          </ListMenuItem>
        </ListMenuSection>
        <ListMenuSection title="Presence Color">
          <ListMenuItem>
            <div className="ColorPicker__swatch">
              <Swatch
                color={doc.color}
                hex={doc.color}
                onClick={() => {}}
                focusStyle={{ border: `0 0 4px ${doc.color}` }}
              />
            </div>
          </ListMenuItem>
          <ListMenuItem>
            <SecondaryText>
              {doc.name}&apos;s presence colour can be used to identify them when they are present
              within a document.
            </SecondaryText>
          </ListMenuItem>
        </ListMenuSection>
        {renderDevices(devices, contactUrl)}
        <SharesSection invites={invites} />
      </ListMenu>
    </CenteredStack>
  )
}

const renderDevices = (devices: HypermergeUrl[] | undefined, contactUrl: HypermergeUrl) => {
  if (!devices) {
    return <SecondaryText>Something is wrong, you should always have a device!</SecondaryText>
  }
  const renderedDevices = devices
    .map((deviceUrl: HypermergeUrl) => createDocumentLink('device', deviceUrl))
    .map((deviceId: PushpinUrl) => (
      <ListMenuItem key={deviceId}>
        <Content context="list" url={deviceId} editable />
      </ListMenuItem>
    ))

  const title = (
    <>
      <ConnectionStatusBadge size="small" hover={false} contactId={contactUrl} />
      Devices
    </>
  )

  return <ListMenuSection title={title}>{renderedDevices}</ListMenuSection>
}
