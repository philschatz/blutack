import React from 'react'
import Debug from 'debug'
import classNames from 'classnames'

import Content, { ContentProps } from '../../Content'
import { ContactDoc } from '.'

import { createDocumentLink } from '../../../ShareLink'
import { DEFAULT_AVATAR_PATH } from '../../../constants'

import './ContactInVarious.css'
import { useDocument } from '../../../Hooks'
import ConnectionStatusBadge from './ConnectionStatusBadge'
import ListItem from '../../ui/ListItem'
import ContentDragHandle from '../../ui/ContentDragHandle'
import TitleWithSubtitle from '../../ui/TitleWithSubtitle'
import CenteredStack from '../../ui/CenteredStack'
import Heading from '../../ui/Heading'

const log = Debug('pushpin:settings')

ContactInVarious.minWidth = 4
ContactInVarious.minHeight = 5

export interface ContactProps extends ContentProps {
  isPresent?: boolean
}

export default function ContactInVarious(props: ContactProps) {
  const [contact] = useDocument<ContactDoc>(props.hypermergeUrl)

  const avatarDocId = contact ? contact.avatarDocId : null
  const name = contact ? contact.name : null

  if (!contact) {
    return null
  }

  const { context, url, hypermergeUrl, isPresent } = props
  const { color } = contact

  const avatarImage = avatarDocId ? (
    <Content context="workspace" url={createDocumentLink('image', avatarDocId)} />
  ) : (
    <img alt="avatar" src={DEFAULT_AVATAR_PATH} />
  )

  const onDoubleClick = (e: React.MouseEvent) => {
    window.location.href = url as string
    e.stopPropagation()
  }

  const avatar = (
    <div className="Contact-avatar" onDoubleClick={onDoubleClick}>
      <div
        className={classNames('Avatar', `Avatar--${context}`, isPresent && 'Avatar--present')}
        style={{ ['--highlight-color' as any]: color }}
        data-name={name}
      >
        {avatarImage}
      </div>
      <div className="Contact-status">
        <ConnectionStatusBadge contactId={props.hypermergeUrl} />
      </div>
    </div>
  )

  switch (context) {
    case 'list':
      return (
        <ListItem>
          <ContentDragHandle url={url}>{avatar}</ContentDragHandle>
          <TitleWithSubtitle title={name || 'Unknown Contact'} hypermergeUrl={hypermergeUrl} />
        </ListItem>
      )

    case 'thread':
      return (
        <div className="Contact-user">
          {avatar}
          <div className="username Contact-username">{name}</div>
        </div>
      )

    case 'title-bar':
      return <ContentDragHandle url={url}>{avatar}</ContentDragHandle>

    case 'board':
      return (
        <CenteredStack>
          {avatar}
          <Heading wrap>{name || ''}</Heading>
        </CenteredStack>
      )

    default:
      log('contact render called in an unexpected context')
      return null
  }
}
