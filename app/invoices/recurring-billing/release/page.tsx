"use client";

import BillingTablePage from "../../../../components/billing/BillingTablePage";
export default function Page(){return <BillingTablePage eyebrow="Billing Automation" title="Release Queue" description="Recurring billing runs awaiting final release or invoice linkage confirmation." tableName="recurring_billing_runs" columns={[{key:"approval_status",label:"Approval",format:"status"},{key:"run_status",label:"Run Status",format:"status"},{key:"amount",label:"Amount",format:"money"},{key:"invoice_id",label:"Invoice ID"},{key:"approved_at",label:"Approved",format:"datetime"}]} backHref="/invoices/recurring-billing" backLabel="Recurring Billing" rowHref={(r)=>r.invoice_id?`/invoices/${String(r.invoice_id)}`:null}/>;}
