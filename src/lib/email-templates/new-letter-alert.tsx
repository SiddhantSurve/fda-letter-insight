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

interface NewLetterAlertProps {
  companyName?: string
  letterKind?: 'warning' | 'untitled'
  issuingOffice?: string | null
  postedOn?: string | null
  subject?: string | null
  letterUrl?: string
}

const KIND_LABEL: Record<string, string> = {
  warning: 'Warning Letter',
  untitled: 'Untitled Letter',
}

const NewLetterAlert = ({
  companyName = 'A company',
  letterKind = 'warning',
  issuingOffice,
  postedOn,
  subject,
  letterUrl = 'https://fdacontent.org',
}: NewLetterAlertProps) => {
  const kind = KIND_LABEL[letterKind] ?? 'Enforcement Letter'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`New FDA ${kind}: ${companyName}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>FDA Enforcement Letter Archive</Text>
          <Heading style={h1}>{`New ${kind} posted`}</Heading>

          <Section style={card}>
            <Text style={company}>{companyName}</Text>
            {subject ? <Text style={meta}>{subject}</Text> : null}
            {issuingOffice ? <Text style={meta}>{`Issuing office: ${issuingOffice}`}</Text> : null}
            {postedOn ? <Text style={meta}>{`Posted: ${postedOn}`}</Text> : null}
          </Section>

          <Button style={button} href={letterUrl}>
            Read the letter
          </Button>

          <Hr style={hr} />
          <Text style={footer}>
            You are receiving this because you subscribed to new-letter alerts. Manage your
            preferences any time on the alerts page.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: NewLetterAlert,
  subject: (data: Record<string, any>) =>
    `New FDA ${KIND_LABEL[data['letterKind'] as string] ?? 'enforcement letter'}: ${
      data['companyName'] ?? 'new posting'
    }`,
  displayName: 'New letter alert',
  previewData: {
    companyName: 'Acme Pharmaceuticals, Inc.',
    letterKind: 'warning',
    issuingOffice: 'Center for Drug Evaluation and Research',
    postedOn: '2026-08-20',
    subject: 'CGMP/Finished Pharmaceuticals/Adulterated',
    letterUrl: 'https://fdacontent.org/letters/00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry

export default NewLetterAlert

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
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#111318',
  margin: '0 0 18px',
}
const card = {
  border: '1px solid #e6e8ec',
  borderLeft: '4px solid #c8102e',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '0 0 22px',
}
const company = {
  fontSize: '16px',
  fontWeight: 'bold' as const,
  color: '#111318',
  margin: '0 0 8px',
}
const meta = { fontSize: '13px', color: '#55575d', lineHeight: '1.5', margin: '0 0 4px' }
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
