import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  PointerEventHandler,
  useMemo,
  useContext,
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
import * as buffer from "buffer"
import ListMenuSection from "../../ui/ListMenuSection"
import { contentType } from "mime-types"
import { LookupResult } from "../../pushpin-code/ContentTypes"
import ListItem from "../../ui/ListItem"
import ContentDragHandle from "../../ui/ContentDragHandle"
import Badge from "../../ui/Badge"
import ColorPicker from "../../ui/ColorPicker"

export interface PdfAnnotation {
  stroke: number[][]
  page: number
  authorId: DocumentId
}

interface PdfPanel {
  type: "pdf"
}

type PdfRegionsPanelFilter = "currentPage" | "all"

interface PdfRegionsPanel {
  type: "regions"
  filter: PdfRegionsPanelFilter
}

interface PdfViewersPanel {
  type: "viewers"
}

type Panel = PdfPanel | PdfRegionsPanel | PdfViewersPanel

export interface PdfDoc extends FileDoc {
  content: string
  panels: Panel[]
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
  annotationUrls: PushpinUrl[]
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

interface ContextMenuProps extends React.PropsWithChildren {
  trigger?: React.ReactElement
  closeOnClick?: boolean
  alignment?: "left" | "right"
}

function ContextMenu({
  trigger,
  children,
  closeOnClick = true,
  alignment = "right",
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const onClick = (event: any) => {
      if (
        !closeOnClick &&
        (!ref.current || ref.current.contains(event.target))
      ) {
        return
      }

      setIsOpen(false)
    }

    document.addEventListener("click", onClick)

    return () => {
      document.removeEventListener("click", onClick)
    }
  })

  return (
    <div className="PdfContent-contextMenu" ref={ref}>
      {
        <div
          onClick={(event) => {
            event.stopPropagation()
            setIsOpen(!isOpen)
          }}
        >
          {trigger ?? (
            <button className="PdfContent-button">
              <i className="fa fa-ellipsis-h" />
            </button>
          )}
        </div>
      }

      {isOpen && (
        <div className={classNames("PdfContent-contextMenuContent", alignment)}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function PdfSplitView(props: ContentProps) {
  const [pdf, changePdf] = useDocument<PdfDoc>(props.documentId)

  // This sections might seem overly complicated, why not just toggle the individual panel if you just have one of each
  // I tried to imagine here how the Pdf viewer could be implemented if we had the ability to span other panes to
  // the right or left of it. This could be used by different component and maybe people would also want to customize
  // for themselves on which side each panel is

  const closePanelAtIndex = useCallback((index: number) => {
    changePdf((pdf) => {
      pdf.panels.splice(index, 1)
    })
  }, [])

  const changeRegionFilterAtIndex = useCallback(
    (index: number, filter: PdfRegionsPanelFilter) => {
      changePdf((pdf) => {
        ;(pdf.panels[index] as PdfRegionsPanel).filter = filter
      })
    },
    []
  )

  const openPdfPanel = useCallback(() => {
    changePdf((pdf) => {
      if (hasRegionsPanel && !hasViewersPanel) {
        pdf.panels.unshift({ type: "pdf" })
      }

      if (!hasRegionsPanel && hasViewersPanel) {
        pdf.panels.push({ type: "pdf" })
      }

      if (hasRegionsPanel && hasViewersPanel) {
        pdf.panels.splice(1, 0, { type: "pdf" })
      }
    })
  }, [changePdf])

  const openRegionsPanel = useCallback(() => {
    changePdf((pdf) => {
      pdf.panels.push({ type: "regions", filter: "currentPage" })
    })
  }, [changePdf])

  const openViewersPanel = useCallback(() => {
    changePdf((pdf) => {
      pdf.panels.unshift({ type: "viewers" })
    })
  }, [changePdf])

  if (!pdf || !pdf.binaryDataId) {
    return null
  }

  // TODO: initialization should not happen in view
  if (!pdf.panels) {
    changePdf((pdf) => {
      pdf.panels = [{ type: "pdf" }]
    })
    return null
  }

  const hasRegionsPanel = pdf.panels.some((panel) => panel.type === "regions")
  const hasViewersPanel = pdf.panels.some((panel) => panel.type === "viewers")
  const hasPdfPanel = pdf.panels.some((panel) => panel.type === "pdf")

  const panels = pdf.panels ?? []

  return (
    <div className="PdfContent-splitView">
      {panels.map((panel, index) => {
        const closeButton =
          panels.length !== 1 ? (
            <button
              type="button"
              onClick={() => closePanelAtIndex(index)}
              className="PdfContent-button"
            >
              <i className="fa fa-times" />
            </button>
          ) : null

        switch (panel.type) {
          case "pdf":
            return (
              <div className="PdfContent-panel">
                <div className="PdfContent-panelHeader">
                  {pdf?.title}

                  <div className="PdfContent-buttonGroup">
                    {(!hasRegionsPanel || !hasViewersPanel) && (
                      <ContextMenu>
                        {!hasRegionsPanel && (
                          <div
                            className="PdfContent-contextMenuOption"
                            onClick={openRegionsPanel}
                          >
                            show annotations
                          </div>
                        )}
                        {!hasViewersPanel && (
                          <div
                            className="PdfContent-contextMenuOption"
                            onClick={openViewersPanel}
                          >
                            show viewer
                          </div>
                        )}
                      </ContextMenu>
                    )}

                    <div>{closeButton}</div>
                  </div>
                </div>
                <PdfContent {...props} key={index} />
              </div>
            )

          case "regions":
            return (
              <div
                className={classNames("PdfContent-panel", {
                  stretch: !hasPdfPanel,
                })}
              >
                <div className="PdfContent-panelHeader">
                  <ContextMenu
                    alignment="left"
                    closeOnClick={false}
                    trigger={<div>Annotations</div>}
                  >
                    <div
                      className={classNames("PdfContent-contextMenuOption", {
                        "is-selected": panel.filter === "currentPage",
                      })}
                      onClick={() =>
                        changeRegionFilterAtIndex(index, "currentPage")
                      }
                    >
                      <div className="PdfContent-circle" />
                      current page
                    </div>
                    <div
                      className={classNames("PdfContent-contextMenuOption", {
                        "is-selected": panel.filter === "all",
                      })}
                      onClick={() => changeRegionFilterAtIndex(index, "all")}
                    >
                      <div className="PdfContent-circle" />
                      all pages
                    </div>
                  </ContextMenu>

                  <div className="PdfContent-buttonGroup">
                    {!hasPdfPanel && (
                      <ContextMenu>
                        <div
                          className="PdfContent-contextMenuOption"
                          onClick={openPdfPanel}
                        >
                          show pdf
                        </div>
                      </ContextMenu>
                    )}

                    {closeButton}
                  </div>
                </div>
                <PdfRegionsList {...props} key={index} filter={panel.filter} />
              </div>
            )

          case "viewers":
            return (
              <div
                className={classNames("PdfContent-panel", {
                  stretch: !hasPdfPanel,
                })}
              >
                <div className="PdfContent-panelHeader">
                  Viewers
                  <div className="PdfContent-buttonGroup">
                    {!hasPdfPanel && (
                      <ContextMenu>
                        <div
                          className="PdfContent-contextMenuOption"
                          onClick={openPdfPanel}
                        >
                          show pdf
                        </div>
                      </ContextMenu>
                    )}
                    {closeButton}
                  </div>
                </div>
                <PdfViewerList {...props} key={index} />
              </div>
            )
        }
      })}
    </div>
  )
}

function stopPropagation(e: React.SyntheticEvent) {
  e.stopPropagation()
  e.nativeEvent.stopImmediatePropagation()
}

export function PdfViewerList(props: ContentProps) {
  const [pdf, changePdf] = useDocument<PdfDoc>(props.documentId)

  if (!pdf || !pdf.binaryDataId) {
    return null
  }

  const openPageNumByPerson = pdf.openPageNumByPerson ?? {}

  return (
    <ListMenu>
      {Object.entries(openPageNumByPerson)
        .filter(([viewerId]) => viewerId !== props.selfId)
        .map(([viewerId, pageNum]) => (
          <ListMenuItem
            onClick={() => {
              // todo:
              // setPageNum(pageNum)
            }}
          >
            <Content
              context="list"
              url={createDocumentLink("contact", viewerId as DocumentId)}
            />
          </ListMenuItem>
        ))}
    </ListMenu>
  )
}

function getRegionsOnPageWithIndex(
  pdf: PdfDoc,
  pageNum: number
): [Region, number][] {
  return getAllRegionsWithIndex(pdf).filter(
    ([region]) => region.page === pageNum
  )
}

function getAllRegionsWithIndex(pdf: PdfDoc): [Region, number][] {
  return pdf.regions ? pdf.regions.map((region, index) => [region, index]) : []
}

interface PdfRegionsListProps extends ContentProps {
  filter: PdfRegionsPanelFilter
}

export function PdfRegionsList(props: PdfRegionsListProps) {
  const [pdf, changePdf] = useDocument<PdfDoc>(props.documentId)

  if (!pdf || !pdf.binaryDataId) {
    return null
  }

  const pageNum =
    (pdf?.openPageNumByPerson && pdf?.openPageNumByPerson[props.selfId]) ?? 1

  const regionsOnPage =
    props.filter === "all"
      ? getAllRegionsWithIndex(pdf)
      : getRegionsOnPageWithIndex(pdf, pageNum)

  const addContentAtIndex = (index: number, type: string) => {
    ContentTypes.create(type, {}, (contentUrl) => {
      changePdf((pdf) => {
        pdf.regions[index].annotationUrls.push(contentUrl)
      })
    })
  }

  return (
    <div className="PdfContent-panel">
      {regionsOnPage.map(([region, index]) => {
        return (
          <PdfRegionListItemView
            onAddContent={(type) => addContentAtIndex(index, type)}
            region={region}
            number={index + 1}
            key={index}
          />
        )
      })}
    </div>
  )
}

export function PdfContent(props: ContentProps) {
  const [points, setPoints] = React.useState<Point[]>([])
  const [rectangle, setRectangle] = React.useState<Rectangle>()
  const [author] = useDocument<ContactDoc>(props.selfId)
  const [selectedTool, setSelectedTool] = React.useState<
    undefined | "marker" | "region"
  >()
  const [pdf, changePdf] = useDocument<PdfDoc>(props.documentId)
  const [numPages, setNumPages] = useState(0)
  const isMarkerSelected = selectedTool === "marker"
  const isRegionToolSelected = selectedTool === "region"
  const pageNum =
    (pdf?.openPageNumByPerson && pdf?.openPageNumByPerson[props.selfId]) ?? 1

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
            annotationUrls: [],
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

  const [pageInputValue, onPageInput] = useConfirmableInput(
    String(pageNum),
    (str) => {
      const nextPageNum = Number.parseInt(str, 10)

      setPageNum(Math.min(numPages, Math.max(1, nextPageNum)))
    }
  )

  const setPageNum = useCallback(
    (number: number) => {
      changePdf((pdf) => {
        if (!pdf.openPageNumByPerson) {
          pdf.openPageNumByPerson = {}
        }

        pdf.openPageNumByPerson[props.selfId] = number
      })
    },
    [changePdf]
  )

  // store openPdf number of user on mount and remove on unmount
  useEffect(() => {
    changePdf((pdf) => {
      if (!pdf.openPageNumByPerson) {
        pdf.openPageNumByPerson = {}
      }

      pdf.openPageNumByPerson[props.selfId] = 1
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

  const stroke = getStroke(points, STROKE_PARAMS)
  const pathData = getSvgPathFromStroke(stroke)

  const { context } = props

  const annotations = pdf.annotations ?? []

  const forwardDisabled = pageNum >= numPages
  const backDisabled = pageNum <= 1

  const regionsOnPage = getRegionsOnPageWithIndex(pdf, pageNum)

  return (
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
          {pdf.annotations &&
            pdf.annotations.map((annotation, index) => {
              if (annotation.page !== pageNum) {
                return
              }

              return (
                <PdfAnnotationOverlayView key={index} annotation={annotation} />
              )
            })}

          {regionsOnPage.map(([region, index]) => {
            return (
              <PdfRegionOverlayView
                region={region}
                number={index + 1}
                key={index}
              />
            )
          })}

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
  )
}

interface PdfSourceLinkProps extends ContentProps {
  region: Region
}

export function PdfAsSourceLink(props: PdfSourceLinkProps) {
  const [pdf] = useDocument<PdfDoc>(props.documentId)

  if (!pdf || !pdf.title) {
    return null
  }

  const subtitle = `on page ${props.region.page}`

  return (
    <ListItem>
      <ContentDragHandle
        url={createDocumentLink("pdf", props.documentId)}
        filename={pdf.title}
        extension="pdf"
        binaryDataId={pdf.binaryDataId}
      >
        <Badge shape="square" icon="file-o" />
      </ContentDragHandle>
      <TitleWithSubtitle
        title={pdf.title}
        subtitle={subtitle}
        documentId={props.documentId}
        editable={false}
      />
    </ListItem>
  )
}

function PdfRegionListItemView({
  region,
  number,
  onAddContent,
}: {
  region: Region
  number: number
  onAddContent: (contentType: string) => void
}) {
  const [author] = useDocument<ContactDoc>(region.authorId)

  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const contentTypes = useMemo(
    () => ContentTypes.list({ context: "board" }),
    []
  )

  return (
    <div className="PdfContent-regionGroup">
      <div
        className="PdfContent-regionMarker"
        style={{ background: author?.color ?? "#fdd835" }}
      >
        {number}
      </div>

      {region.annotationUrls.map((contentUrl, index) => (
        <div className="PdfContent-annotationContent">
          <Content context="board" url={contentUrl} index={index} />
        </div>
      ))}

      <ListMenuItem onClick={() => setIsMenuOpen(!isMenuOpen)}>
        + Add new item
      </ListMenuItem>

      {isMenuOpen && (
        <ListMenuSection>
          {contentTypes.map((contentType) => (
            <ListMenuItem
              onClick={() => {
                onAddContent(contentType.type)
                setIsMenuOpen(false)
              }}
              key={contentType.type}
            >
              <div className="ContextMenu__iconBounding ContextMenu__iconBounding--note">
                <i className={classNames("fa", `fa-${contentType.icon}`)} />
              </div>
              <span className="ContextMenu__label">{contentType.name}</span>
            </ListMenuItem>
          ))}
        </ListMenuSection>
      )}
    </div>
  )
}

function PdfRegionOverlayView({
  region,
  number,
}: {
  region: Region
  number: number
}) {
  const [author] = useDocument<ContactDoc>(region.authorId)

  const { rectangle } = region

  const width = rectangle.to[0] - rectangle.from[0]
  const height = rectangle.to[1] - rectangle.from[1]

  return (
    <g transform={`translate(${rectangle.from[0]}, ${rectangle.from[1]})`}>
      <rect
        className="PdfContent-region"
        width={width}
        height={height}
        stroke={author?.color ?? "#fdd835"}
        strokeWidth={5}
        fill="transparent"
      />
      <g transform={`translate(${width}, ${height})`}>
        <circle
          fill={author?.color ?? "#fdd835"}
          x={-20}
          y={-20}
          r={20}
        ></circle>
        <text
          fill="white"
          x={0}
          y={1}
          alignmentBaseline="middle"
          textAnchor="middle"
          style={{
            fontWeight: "bold",
            fontSize: "24px",
            fontFamily: "sans-serif",
          }}
        >
          {number}
        </text>
      </g>
    </g>
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
    workspace: PdfSplitView,
    board: PdfSplitView,
    "source-link": PdfAsSourceLink,
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
