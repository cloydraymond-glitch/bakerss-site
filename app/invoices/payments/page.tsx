"use client";

import BillingTablePage from "../../../components/billing/BillingTablePage";
export default function Page(){return <BillingTablePage eyebrow="Accounts Receivable" title="Payments" description="Payment reconciliation history recorded against customer invoices." tableName="invoice_payments" columns={[{key:"payment_date",label:"Payment Date",format:"date"},{key:"amount",label:"Amount",format:"money"},{key:"payment_method",label:"Method",format:"status"},{key:"reference_number",label:"Reference"},{key:"invoice_id",label:"Invoice ID"}]} rowHref={(r)=>r.invoice_id?`/invoices/${String(r.invoice_id)}`:null}/>;}
