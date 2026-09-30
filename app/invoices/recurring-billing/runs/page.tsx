"use client";

import BillingTablePage from "../../../../components/billing/BillingTablePage";
export default function Page(){return <BillingTablePage eyebrow="Billing Automation" title="Recurring Billing Runs" description="Run history for recurring-service billing generation and approval." tableName="recurring_billing_runs" columns={[{key:"run_status",label:"Run Status",format:"status"},{key:"billing_period_start",label:"Period Start",format:"date"},{key:"billing_period_end",label:"Period End",format:"date"},{key:"amount",label:"Amount",format:"money"},{key:"invoice_id",label:"Invoice ID"},{key:"created_at",label:"Created",format:"datetime"}]} backHref="/invoices/recurring-billing" backLabel="Recurring Billing" rowHref={(r)=>r.invoice_id?`/invoices/${String(r.invoice_id)}`:null}/>;}
