'use client'

import { useVault } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Database, FileText, Activity, Clock } from 'lucide-react'
import { DOC_TYPE_LABELS } from '@/lib/og/types'
import { storageScanUrl } from '@/lib/og/config'

export default function TransactionsPage() {
  const { records, autoWalletAddress } = useVault()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Database className="h-8 w-8 text-primary" />
          Network Transactions
        </h1>
        <p className="text-muted-foreground text-lg">
          View all your decentralized storage and index operations on the 0G Network.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Auto-Wallet Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-mono break-all font-semibold">
              {autoWalletAddress || 'Not connected'}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This deterministic wallet pays the gas for your 0G storage and KV operations.
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{records.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Encrypted documents indexed in 0G-KV
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>
            Recent uploads and KV index writes to the decentralized network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-foreground">No transactions found</p>
              <p className="text-sm text-muted-foreground mt-1">Upload a document to see your network activity.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="bg-muted/50 border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Document</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">0G Root Hash (Storage ID)</th>
                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-muted/30 transition-colors border-b data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-medium">
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
                          Upload & Index
                        </span>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="font-semibold">{record.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {DOC_TYPE_LABELS[record.docType]}
                        </div>
                      </td>
                      <td className="p-4 align-middle font-mono text-xs text-muted-foreground truncate max-w-[200px] md:max-w-[400px]">
                        <a 
                          href={storageScanUrl(record.rootHash)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hover:text-primary hover:underline flex items-center gap-1"
                        >
                          {record.rootHash}
                        </a>
                      </td>
                      <td className="p-4 align-middle text-right whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(record.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
