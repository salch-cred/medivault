import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <h2 className="font-serif text-3xl tracking-tight">404</h2>
          <p className="text-sm text-muted-foreground">
            The page or record you&apos;re looking for doesn&apos;t exist or may have been removed.
          </p>
          <Link href="/">
            <Button variant="default">Back to home</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
