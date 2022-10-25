import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  PointerEventHandler,
  useMemo,
} from "react"
import { getStroke, StrokePoint } from "perfect-freehand"

import { Document, Page, pdfjs } from "react-pdf"

// TODO: see if we can find a better way to load this file;
// some ideas: https://github.com/wojtekmaj/react-pdf/issues/97
pdfjs.GlobalWorkerOptions.workerSrc = `/blutack/pdf.worker.js`

import { useDocument } from "automerge-repo-react-hooks"
import { FileDoc } from "."

import * as ContentTypes from "../../pushpin-code/ContentTypes"
import Content, { ContentProps } from "../../Content"
import "./PdfContent.css"
import { createBinaryDataUrl } from "../../../blobstore/Blob"
import { useConfirmableInput } from "../../pushpin-code/Hooks"
import {
  createDocumentLink,
  parseDocumentLink,
  PushpinUrl,
} from "../../pushpin-code/ShareLink"
import ContentList, { ContentListDoc, ContentListInList } from "../ContentList"
import { DocHandle, DocumentId } from "automerge-repo"
import { ContactDoc } from "../contact"
import classNames from "classnames"
import TitleWithSubtitle from "../../ui/TitleWithSubtitle"
import Heading from "../../ui/Heading"
import ListMenu from "../../ui/ListMenu"
import ListMenuItem from "../../ui/ListMenuItem"

export interface PdfAnnotation {
  stroke: number[][]
  page: number
  authorId: DocumentId
}

export interface PdfDoc extends FileDoc {
  content: string
  annotations: PdfAnnotation[]
  regions: Region[]
  openPageNumByPerson: { [id: DocumentId]: number } // todo: handle case where person has pdf open multiple times
}

const PAGE_WIDTH = 1600
const PAGE_HEIGHT = 2070

const STROKE_PARAMS = {
  size: 10,
  thinning: 0.1,
  smoothing: 0.75,
  streamline: 0.5,
}

type Point = number[]

type Rectangle = {
  from: Point
  to: Point
}

type Region = {
  rectangle: Rectangle
  page: number
  url?: PushpinUrl
  authorId: DocumentId
}

function getSvgPathFromStroke(stroke: Point[]) {
  if (!stroke.length) return ""

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ["M", ...stroke[0], "Q"]
  )

  d.push("Z")
  return d.join(" ")
}

function stopPropagation(e: React.SyntheticEvent) {
  e.stopPropagation()
  e.nativeEvent.stopImmediatePropagation()
}

export default function PdfContent(props: ContentProps) {
  const [points, setPoints] = React.useState<Point[]>([])
  const [rectangle, setRectangle] = React.useState<Rectangle>()
  const [author] = useDocument<ContactDoc>(props.selfId)
  const [selectedTool, setSelectedTool] = React.useState<
    undefined | "marker" | "region"
  >()

  const isMarkerSelected = selectedTool === "marker"
  const isRegionToolSelected = selectedTool === "region"

  const handlePointerDown: PointerEventHandler<SVGSVGElement> = useCallback(
    (e: any) => {
      const bounds = e.target.getBoundingClientRect()
      const x = ((e.clientX - bounds.left) / bounds.width) * PAGE_WIDTH
      const y = ((e.clientY - bounds.top) / bounds.height) * PAGE_HEIGHT

      e.target.setPointerCapture(e.pointerId)
      e.preventDefault()

      if (isMarkerSelected) {
        setPoints([[x, y, e.pressure]])
        return
      }

      if (isRegionToolSelected) {
        setRectangle({
          from: [x, y],
          to: [x, y],
        })
        return
      }
    },
    [isMarkerSelected, isRegionToolSelected, rectangle, points]
  )

  const handlePointerMove: PointerEventHandler<SVGSVGElement> = useCallback(
    (e: any) => {
      if (e.buttons !== 1) return

      const bounds = e.target.getBoundingClientRect()
      const x = ((e.clientX - bounds.left) / bounds.width) * PAGE_WIDTH
      const y = ((e.clientY - bounds.top) / bounds.height) * PAGE_HEIGHT
      e.preventDefault()

      if (isMarkerSelected) {
        setPoints([...points, [x, y, e.pressure]])
        return
      }

      if (isRegionToolSelected && rectangle) {
        setRectangle({ ...rectangle, to: [x, y] })
        return
      }
    },
    [isMarkerSelected, isRegionToolSelected, rectangle, points]
  )

  const handlePointerUp: PointerEventHandler<SVGSVGElement> = useCallback(
    (e) => {
      e.preventDefault()

      if (isMarkerSelected && points.length !== 0) {
        changePdf((pdf) => {
          pdf.annotations.push({
            stroke: getStroke(points, STROKE_PARAMS),
            page: pageNum,
            authorId: props.selfId,
          })
        })

        setPoints([])
        return
      }

      if (isRegionToolSelected && rectangle) {
        changePdf((pdf) => {
          pdf.regions.push({
            rectangle,
            page: pageNum,
            authorId: props.selfId,
          })
        })

        setSelectedTool(undefined)
        setRectangle(undefined)
      }
    },
    [isMarkerSelected, isRegionToolSelected, rectangle, points]
  )

  const toggleIsMarkerSelected = useCallback(() => {
    setSelectedTool(isMarkerSelected ? undefined : "marker")
  }, [isMarkerSelected])

  const toggleIsRegionToolSelected = useCallback(() => {
    setSelectedTool(isRegionToolSelected ? undefined : "region")
  }, [isRegionToolSelected])

  const stroke = getStroke(points, STROKE_PARAMS)

  const pathData = getSvgPathFromStroke(stroke)

  const [pdf, changePdf] = useDocument<PdfDoc>(props.documentId)
  const [pageNum, _setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [pageInputValue, onPageInput] = useConfirmableInput(
    String(pageNum),
    (str) => {
      const nextPageNum = Number.parseInt(str, 10)

      setPageNum(Math.min(numPages, Math.max(1, nextPageNum)))
    }
  )

  const setPageNum = useCallback(
    (number: number) => {
      _setPageNum(number)

      changePdf((pdf) => {
        if (!pdf.openPageNumByPerson) {
          pdf.openPageNumByPerson = {}
        }

        pdf.openPageNumByPerson[props.selfId] = pageNum
      })
    },
    [_setPageNum]
  )

  // store openPdf number of user on mount and remove on unmount
  useEffect(() => {
    changePdf((pdf) => {
      if (!pdf.openPageNumByPerson) {
        pdf.openPageNumByPerson = {}
      }

      pdf.openPageNumByPerson[props.selfId] = pageNum
    })

    return () => {
      changePdf((pdf) => {
        delete pdf.openPageNumByPerson[props.selfId]
      })
    }
  }, [])

  function goForward() {
    if (pageNum < numPages) {
      setPageNum(pageNum + 1)
    }
  }

  function goBack() {
    if (pageNum > 1) {
      setPageNum(pageNum - 1)
    }
  }

  const onDocumentLoadSuccess = useCallback(
    (result: any) => {
      const { numPages } = result

      setNumPages(numPages)

      result.getMetadata().then((metadata: any) => {
        const { info = {} } = metadata
        const { Title } = info

        if (Title && pdf && !pdf.title) {
          changePdf((doc) => {
            doc.title = Title
          })
        }
      })

      if (pdf && !pdf.content) {
        getPDFText(result).then((content) => {
          changePdf((doc) => {
            doc.content = content
          })
        })
      }
    },
    [changePdf, pdf]
  )

  if (!pdf) {
    return null
  }

  // todo: annotationList initation shouldn't happen in view

  if (!pdf.annotations) {
    changePdf((pdf) => {
      pdf.annotations = []
    })
  }

  if (!pdf.regions) {
    changePdf((pdf) => {
      pdf.regions = []
    })
  }

  const { context } = props

  const annotations = pdf.annotations ?? []

  const forwardDisabled = pageNum >= numPages
  const backDisabled = pageNum <= 1

  const openPageNumByPerson = pdf.openPageNumByPerson ?? {}

  return (
    <div className="PdfContent">
      <div className="PdfContent-sidebar is-left">
        <div className="PdfContent-sidebarTitle">Viewers</div>

        <ListMenu>
          {Object.entries(openPageNumByPerson)
            .filter(([viewerId]) => viewerId !== props.selfId)
            .map(([viewerId, pageNum]) => (
              <ListMenuItem
                onClick={() => {
                  setPageNum(pageNum)
                }}
              >
                <Content
                  context="list"
                  url={createDocumentLink("contact", viewerId as DocumentId)}
                />
              </ListMenuItem>
            ))}
        </ListMenu>
      </div>

      <div
        className={classNames("PdfContent-main", {
          "is-tool-selected": selectedTool !== undefined,
        })}
      >
        <div className="PdfContent-header" onDoubleClick={stopPropagation}>
          <div className="PdfContent-header-left"></div>
          <button
            disabled={backDisabled}
            type="button"
            onClick={goBack}
            className="PdfContent-button"
          >
            <i className="fa fa-angle-left" />
          </button>
          <input
            className="PdfContent-headerInput"
            value={pageInputValue}
            type="number"
            min={1}
            max={numPages}
            onChange={onPageInput}
            onKeyDown={onPageInput}
          />
          <div className="PdfContent-headerNumPages">/ {numPages}</div>
          <button
            disabled={forwardDisabled}
            type="button"
            onClick={goForward}
            className="PdfContent-button"
          >
            <i className="fa fa-angle-right" />
          </button>

          <div className="PdfContent-header-right">
            <button
              disabled={forwardDisabled}
              type="button"
              onClick={toggleIsRegionToolSelected}
              className={classNames("PdfContent-button ", {
                "is-selected": isRegionToolSelected,
              })}
            >
              <i className="fa fa-plus-square" />
            </button>
            <button
              disabled={forwardDisabled}
              type="button"
              onClick={toggleIsMarkerSelected}
              className={classNames("PdfContent-button ", {
                "is-selected": isMarkerSelected,
              })}
            >
              <i className="fa fa-pencil" />
            </button>
          </div>
        </div>

        <div className="PdfContent-document">
          <Document
            file={createBinaryDataUrl(pdf.binaryDataId)}
            onLoadSuccess={onDocumentLoadSuccess}
          >
            <Page
              loading=""
              pageNumber={pageNum}
              className="PdfContent-page"
              width={1600}
              renderTextLayer={false}
            />
          </Document>

          <svg
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            viewBox="0 0 1600 2070"
            width={PAGE_WIDTH}
            height={PAGE_HEIGHT}
            style={{
              position: "absolute",
              top: 0,
              width: "100%",
              height: "auto",
            }}
          >
            {
              // TODO: we should be using Content here, but I need to pass the selectedPage to the view
              pdf.annotations &&
                pdf.annotations.map((annotation, index) => {
                  if (annotation.page !== pageNum) {
                    return
                  }

                  return (
                    <PdfAnnotationOverlayView
                      key={index}
                      annotation={annotation}
                    />
                  )
                })
            }

            {
              // TODO: we should be using Content here, but I need to pass the selectedPage to the view
              pdf.regions &&
                pdf.regions.map((region, index) => {
                  if (region.page !== pageNum) {
                    return
                  }

                  return <PdfRegionOvelaryView region={region} />
                })
            }

            {rectangle && (
              <rect
                x={rectangle.from[0]}
                y={rectangle.from[1]}
                width={rectangle.to[0] - rectangle.from[0]}
                height={rectangle.to[1] - rectangle.from[1]}
                stroke={author?.color ?? "#fdd835"}
                strokeWidth={3}
                fill="transparent"
              />
            )}

            {points && (
              <path
                d={pathData}
                opacity={0.5}
                fill={author?.color ?? "#fdd835"}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  )
}

function PdfRegionOvelaryView({ region }: { region: Region }) {
  const [author] = useDocument<ContactDoc>(region.authorId)

  const { rectangle } = region

  return (
    <rect
      className="PdfContent-region"
      x={rectangle.from[0]}
      y={rectangle.from[1]}
      width={rectangle.to[0] - rectangle.from[0]}
      height={rectangle.to[1] - rectangle.from[1]}
      stroke={author?.color ?? "#fdd835"}
      strokeWidth={5}
      fill="transparent"
    />
  )
}

function PdfAnnotationOverlayView({
  annotation,
}: {
  annotation: PdfAnnotation
}) {
  const [author] = useDocument<ContactDoc>(annotation.authorId)

  const pathData = getSvgPathFromStroke(annotation.stroke)

  return <path d={pathData} opacity={0.5} fill={author?.color ?? "#fdd835"} />
}

const supportsMimeType = (mimeType: string) =>
  !!mimeType.match("application/pdf")

ContentTypes.register({
  type: "pdf",
  name: "PDF",
  icon: "file-pdf-o",
  unlisted: true,
  contexts: {
    workspace: PdfContent,
    board: PdfContent,
  },
  supportsMimeType,
})

//TODO: any types
const getPageText = async (pdf: any, pageNo: number): Promise<string> => {
  const page = await pdf.getPage(pageNo)
  const tokenizedText = await page.getTextContent()
  const pageText = tokenizedText.items.map((token: any) => token.str).join("")
  return pageText
}

export const getPDFText = async (pdf: any): Promise<string> => {
  const maxPages = pdf.numPages
  const pageTextPromises: Promise<string>[] = []
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    pageTextPromises.push(getPageText(pdf, pageNo))
  }
  const pageTexts = await Promise.all(pageTextPromises)
  return pageTexts.join(" ")
}
