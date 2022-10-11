import React from 'react'
import ReactDOM from 'react-dom/client'
import Root from './components/Root'
import './app.css'
import './ibm-plex.css'
import './vendor/line-awesome/css/line-awesome.min.css'

import localforage from "localforage"

import { DocumentId, Repo } from "automerge-repo"
import { LocalForageStorageAdapter } from "automerge-repo-storage-localforage"
import { BroadcastChannelNetworkAdapter } from "automerge-repo-network-broadcastchannel"
import {  RepoContext } from 'automerge-repo-react-hooks'
import * as ContentTypes from './components/pushpin-code/ContentTypes'
import { create as createWorkspace } from './components/content-types/workspace/Workspace'
import { BrowserWebSocketClientAdapter } from 'automerge-repo-network-websocket'
import {storeBinary} from "./binary-store";


/* disabled to make debugging simpler.
// find this at chrome://inspect#workers, then hit inspect
new SharedWorker(
  new URL("./shared-worker.js", import.meta.url),
  { type: "module", name: "automerge-repo-shared-worker" }
)
*/

storeBinary("answer", "42").then(() => {
  fetch('/src/binary/answer')
    .then((res) => res.text())
    .then(text => console.log('sw: ANSWER:', text))
})



// sync-server instructions:
// $ cd automerge-repo/packages/automerge-repo-sync-server
// $ yarn
// $ mkdir .amrg
// $ yarn start
let host = new URLSearchParams(window.location.search).get('host') || "automerge-repo-sync-server.fly.dev";
const url = `wss://${host}`
const repo = await Repo({
    storage: new LocalForageStorageAdapter(),
    network: [
      new BroadcastChannelNetworkAdapter(),
      new BrowserWebSocketClientAdapter(url),
    ],
    sharePolicy: (peerId) => peerId.includes("storage-server"),
})

ContentTypes.setRepo(repo)

const findOrMakeDoc = async (key: string): Promise<DocumentId> => {
  let docId = new URLSearchParams(window.location.search).get(key);

  if (!docId) { docId = await localforage.getItem(key) }
  if (!docId) {
    const workspaceHandle = repo.create()
    docId = workspaceHandle.documentId
    if (key == "workspaceDocId") {
      createWorkspace({}, workspaceHandle)
    }
    await localforage.setItem(key, docId)
  }
  return docId as DocumentId
}

// bootstrapping: first try the window location, then check indexedDB, then make one
const workspaceDocId = await findOrMakeDoc("workspaceDocId")
const deviceDocId = await findOrMakeDoc("deviceDocId")

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RepoContext.Provider value={repo}>
      <Root workspaceDocId={workspaceDocId} deviceDocId={deviceDocId}/>
    </RepoContext.Provider>
  </React.StrictMode>
)
