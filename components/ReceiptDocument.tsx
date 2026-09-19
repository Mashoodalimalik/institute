'use client';

import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer';
import { Receipt, Profile } from '@/lib/types';

Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hiJ-Ek-_EeA.woff', fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    backgroundColor: '#ffffff',
    padding: 48,
    fontSize: 9,
    color: '#1e293b',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
    paddingBottom: 20,
    borderBottom: '2px solid #4f46e5',
  },
  headerLeft: { flexDirection: 'column' },
  instituteName: {
    fontSize: 22,
    fontWeight: 700,
    color: '#4f46e5',
    marginBottom: 4,
  },
  instituteSubtext: { color: '#64748b', fontSize: 9 },
  receiptBadge: {
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    textAlign: 'center',
  },
  receiptNumber: {
    color: '#c7d2fe',
    fontSize: 8,
    textAlign: 'center',
    marginTop: 2,
  },

  // Info grid
  infoRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  infoBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderLeft: '3px solid #4f46e5',
  },
  infoBoxLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  infoBoxValue: { fontSize: 10, fontWeight: 700, color: '#0f172a' },
  infoBoxSub: { fontSize: 8, color: '#64748b', marginTop: 2 },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 2,
  },
  tableHeaderCell: { color: '#a5b4fc', fontWeight: 700, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    marginBottom: 2,
  },
  tableRowAlt: { backgroundColor: '#ffffff' },
  tableCell: { color: '#334155', fontSize: 9 },
  col1: { flex: 3 },
  col2: { flex: 1.5, textAlign: 'right' },
  col3: { flex: 1.5, textAlign: 'right' },
  col4: { flex: 2, textAlign: 'right' },

  // Summary
  summaryBox: {
    marginTop: 16,
    alignSelf: 'flex-end',
    width: '45%',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryLabel: { color: '#64748b', fontSize: 9 },
  summaryValue: { color: '#0f172a', fontSize: 9, fontWeight: 700 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    marginTop: 4,
    borderTop: '1.5px solid #4f46e5',
  },
  totalLabel: { color: '#4f46e5', fontSize: 11, fontWeight: 700 },
  totalValue: { color: '#4f46e5', fontSize: 11, fontWeight: 700 },

  // Payment method
  paymentBadge: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentLabel: { color: '#64748b', fontSize: 8 },
  paymentValue: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 700,
  },

  // Footer
  footer: {
    marginTop: 32,
    paddingTop: 16,
    borderTop: '1px solid #e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerNote: { color: '#94a3b8', fontSize: 7, lineHeight: 1.6 },
  stamp: {
    alignItems: 'center',
  },
  stampCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    border: '2px solid #4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
  },
  stampText: { color: '#4f46e5', fontSize: 6, fontWeight: 700, textAlign: 'center', lineHeight: 1.5 },

  // Status bar
  statusBar: {
    backgroundColor: '#ecfdf5',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  statusText: { color: '#15803d', fontSize: 8, fontWeight: 700 },
});

interface ReceiptDocumentProps {
  receipt: Receipt;
  student: Profile;
  instituteName?: string;
}

export default function ReceiptDocument({
  receipt,
  student,
  instituteName = 'Okasha Institute',
}: ReceiptDocumentProps) {
  const netAmount = receipt.amount - receipt.discount;
  const createdDate = new Date(receipt.created_at);
  const dateStr = createdDate.toLocaleDateString('en-PK', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = createdDate.toLocaleTimeString('en-PK', {
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <Document
      title={`Receipt ${receipt.receipt_number}`}
      author={instituteName}
      creator={instituteName}
    >
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.instituteName}>{instituteName}</Text>
            <Text style={styles.instituteSubtext}>Institute Management System</Text>
            <Text style={styles.instituteSubtext}>admin@okasha.edu.pk • www.okasha.edu.pk</Text>
          </View>
          <View>
            <Text style={styles.receiptBadge}>FEE RECEIPT</Text>
            <Text style={styles.receiptNumber}>{receipt.receipt_number}</Text>
          </View>
        </View>

        {/* Info grid */}
        <View style={styles.infoRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxLabel}>Student Name</Text>
            <Text style={styles.infoBoxValue}>{student.full_name}</Text>
            <Text style={styles.infoBoxSub}>{student.class_name || 'N/A'}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxLabel}>Receipt Date</Text>
            <Text style={styles.infoBoxValue}>{dateStr}</Text>
            <Text style={styles.infoBoxSub}>{timeStr}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxLabel}>Student ID</Text>
            <Text style={styles.infoBoxValue}>{student.id.slice(0, 12).toUpperCase()}</Text>
            <Text style={styles.infoBoxSub}>RFID: {student.rfid_tag || 'N/A'}</Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.col1]}>Description</Text>
          <Text style={[styles.tableHeaderCell, styles.col2]}>Month</Text>
          <Text style={[styles.tableHeaderCell, styles.col3]}>Discount</Text>
          <Text style={[styles.tableHeaderCell, styles.col4]}>Amount (PKR)</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.col1]}>Monthly Tuition Fee</Text>
          <Text style={[styles.tableCell, styles.col2]}>
            {createdDate.toLocaleString('en-PK', { month: 'long', year: 'numeric' })}
          </Text>
          <Text style={[styles.tableCell, styles.col3]}>
            {receipt.discount > 0 ? `PKR ${receipt.discount.toLocaleString()}` : '—'}
          </Text>
          <Text style={[styles.tableCell, styles.col4]}>{receipt.amount.toLocaleString()}</Text>
        </View>

        {/* Payment status */}
        <View style={styles.statusBar}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>PAYMENT RECEIVED — FEE STATUS: PAID</Text>
        </View>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>PKR {receipt.amount.toLocaleString()}</Text>
          </View>
          {receipt.discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Discount Applied</Text>
              <Text style={[styles.summaryValue, { color: '#16a34a' }]}>
                − PKR {receipt.discount.toLocaleString()}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Net Total Paid</Text>
            <Text style={styles.totalValue}>PKR {netAmount.toLocaleString()}</Text>
          </View>
        </View>

        {/* Payment method */}
        <View style={styles.paymentBadge}>
          <Text style={styles.paymentLabel}>Payment Method:</Text>
          <Text style={styles.paymentValue}>{receipt.payment_method}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerNote}>
            <Text>This is a computer-generated receipt and does not require a physical signature.</Text>
            <Text>For queries, contact: admin@okasha.edu.pk | Receipt #: {receipt.receipt_number}</Text>
            <Text>Generated by Okasha Institute Management System on {dateStr}</Text>
          </View>
          <View style={styles.stamp}>
            <View style={styles.stampCircle}>
              <Text style={styles.stampText}>OKASHA{'\n'}INSTITUTE{'\n'}VERIFIED</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  );
}
