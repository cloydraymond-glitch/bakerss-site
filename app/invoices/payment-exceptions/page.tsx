"use client";

import BillingTablePage from "../../../components/billing/BillingTablePage";
export default function Page(){return <BillingTablePage eyebrow="Accounts Receivable" title="Payment Exceptions" description="Exceptions requiring review before a payment can be fully reconciled." tableName="payment_exception_cases" columns={[{key:"status",label:"Status",format:"status"},{key:"exception_type",label:"Type"},{key:"amount",label:"Amount",format:"money"},{key:"invoice_id",label:"Invoice ID"},{key:"created_at",label:"Created",format:"datetime"}]} rowHref={(r)=>r.invoice_id?`/invoices/${String(r.invoice_id)}`:null}/>;}
