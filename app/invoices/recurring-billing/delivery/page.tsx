"use client";

import BillingTablePage from "../../../../components/billing/BillingTablePage";
export default function Page(){return <BillingTablePage eyebrow="Billing Automation" title="Delivery Queue" description="Invoice delivery activity and records prepared for customer communication." tableName="invoice_delivery_activity" columns={[{key:"delivery_status",label:"Status",format:"status"},{key:"invoice_id",label:"Invoice ID"},{key:"delivery_method",label:"Method"},{key:"delivered_to",label:"Recipient"},{key:"created_at",label:"Created",format:"datetime"}]} backHref="/invoices/recurring-billing" backLabel="Recurring Billing" rowHref={(r)=>r.invoice_id?`/invoices/${String(r.invoice_id)}`:null}/>;}
