import React, { useCallback } from "react"

import * as ContentTypes from "../pushpin-code/ContentTypes"
import { useDocument } from "automerge-repo-react-hooks"
import "./TextContent.css"
import Badge from "../ui/Badge"
import ListItem from "../ui/ListItem"
import ContentDragHandle from "../ui/ContentDragHandle"
import TitleWithSubtitle from "../ui/TitleWithSubtitle"
import { DocumentWithTitle } from "./workspace/Workspace"
import { ContentProps, EditableContentProps } from "../Content"
import "./RawView.css"
import ReactJson, { InteractionProps } from "react-json-view"

export default function RawView(props: ContentProps) {
  const [doc, changeDoc] = useDocument(props.documentId)

  const onEdit = useCallback(
    ({ namespace, new_value, name }: InteractionProps) => {
      console.log("onEdit", { namespace, new_value, name })

      changeDoc((doc) => {
        let current: any = doc

        for (const key of namespace) {
          current = current[key as string]
        }

        current[name as string] = new_value
      })
    },
    [changeDoc]
  )

  const onAdd = useCallback(() => true, [])
  const onDelete = useCallback(({ namespace, name }: InteractionProps) => {
    changeDoc((doc) => {
      let current: any = doc

      for (const key of namespace) {
        current = current[key as string]
      }

      delete current[name as string]
    })
  }, [])

  if (!doc) {
    return null
  }

  return (
    <div className="RawView">
      <ReactJson src={doc} onEdit={onEdit} onAdd={onAdd} onDelete={onDelete} />
    </div>
  )
}

function JsonInList(props: EditableContentProps) {
  const { documentId, url, editable } = props
  const [doc] = useDocument<DocumentWithTitle>(documentId)
  if (!doc) return null

  const title = doc.title || documentId

  return (
    <ListItem>
      <ContentDragHandle url={url}>
        <Badge icon="file-code" size="medium" />
      </ContentDragHandle>
      <TitleWithSubtitle
        title={title}
        documentId={documentId}
        editable={editable}
      />
    </ListItem>
  )
}

ContentTypes.register({
  unlisted: true,
  type: "raw",
  name: "Raw",
  icon: "file-code",
  contexts: {
    workspace: RawView,
    board: RawView,
    list: JsonInList,
    "title-bar": JsonInList,
  },
})
