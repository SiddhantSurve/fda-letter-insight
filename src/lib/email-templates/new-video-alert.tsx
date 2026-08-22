import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import type { TemplateEntry } from './registry'

interface NewVideoAlertProps {
  title?: string
  description?: string | null
  channelTitle?: string | null
  publishedAt?: string | null
  youtubeUrl?: string
  archiveUrl?: string
}

const NewVideoAlert = ({
  title = 'A new video',
  description,
  channelTitle = 'Commercial Archivist',
  publishedAt,
  youtubeUrl = 'https://www.youtube.com/@commercialarchivist',
  archiveUrl = 'https://fdacontent.org/commercial-archive',
}: NewVideoAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New video: ${title}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{channelTitle ?? 'Commercial Archivist'}</Text>
        <Heading style={h1}>New video posted</Heading>

        <Section style={card}>
          <Text style={videoTitle}>{title}</Text>
          {description ? <Text style={meta}>{description}</Text> : null}
          {publishedAt ? <Text style={meta}>{`Published: ${publishedAt}`}</Text> : null}
        </Section>

        <Button style={button} href={youtubeUrl}>
          Watch on YouTube
        </Button>
        <Text style={meta}>
          <a href={archiveUrl} style={link}>
            Open the video archive
          </a>
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          You are receiving this because you subscribed to new-video alerts. Manage your
          preferences any time on the alerts page.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NewVideoAlert,
  subject: (data: Record<string, any>) => `New video: ${data['title'] ?? 'Commercial Archivist'}`,
  displayName: 'New video alert',
  previewData: {
    title: 'Voltaren Commercial (2026)',
    description: 'Voltaren, "Live for the Game" (2026)',
    channelTitle: 'Commercial Archivist',
    publishedAt: '2026-08-22',
    youtubeUrl: 'https://www.youtube.com/watch?v=aih8IlzFtWg',
    archiveUrl: 'https://fdacontent.org/commercial-archive',
  },
} satisfies TemplateEntry

export default NewVideoAlert

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 25px', maxWidth: '560px' }
const eyebrow = {
  fontSize: '12px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#c8102e',
  fontWeight: 'bold' as const,
  margin: '0 0 8px',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111318', margin: '0 0 18px' }
const card = {
  border: '1px solid #e6e8ec',
  borderLeft: '4px solid #c8102e',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '0 0 22px',
}
const videoTitle = {
  fontSize: '16px',
  fontWeight: 'bold' as const,
  color: '#111318',
  margin: '0 0 8px',
}
const meta = { fontSize: '13px', color: '#55575d', lineHeight: '1.5', margin: '0 0 4px' }
const link = { color: '#c8102e' }
const button = {
  backgroundColor: '#c8102e',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e6e8ec', margin: '26px 0 16px' }
const footer = { fontSize: '12px', color: '#8a8d93', lineHeight: '1.5', margin: '0' }
