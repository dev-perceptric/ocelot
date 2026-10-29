
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "id": boolean,"payments_on": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"payments_on"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "id"?: boolean,"payments_on"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"application_events": {
                  Row: {
                    "actor_id": string | null,"application_id": string,"created_at": string,"from_stage": string | null,"id": string,"kind": string,"to_stage": string | null,"visible_to_candidate": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"application_id": string,"created_at"?: string,"from_stage"?: string | null,"id"?: string,"kind": string,"to_stage"?: string | null,"visible_to_candidate"?: boolean
                  }
                  Update: {
                    "actor_id"?: string | null,"application_id"?: string,"created_at"?: string,"from_stage"?: string | null,"id"?: string,"kind"?: string,"to_stage"?: string | null,"visible_to_candidate"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"application_notes": {
                  Row: {
                    "application_id": string,"author_id": string,"body": string,"created_at": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"author_id": string,"body": string,"created_at"?: string,"id"?: string
                  }
                  Update: {
                    "application_id"?: string,"author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_notes_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "candidate_deleted_at": string | null,"candidate_id": string | null,"hiring_stage": string,"id": string,"job_id": string,"org_id": string,"resume_id": string | null,"snapshot": NonNullable<Json>,"snapshot_version": number,"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_deleted_at"?: string | null,"candidate_id"?: string | null,"hiring_stage"?: string,"id"?: string,"job_id": string,"org_id": string,"resume_id"?: string | null,"snapshot"?: NonNullable<Json>,"snapshot_version"?: number,"submitted_at"?: string
                  }
                  Update: {
                    "candidate_deleted_at"?: string | null,"candidate_id"?: string | null,"hiring_stage"?: string,"id"?: string,"job_id"?: string,"org_id"?: string,"resume_id"?: string | null,"snapshot"?: NonNullable<Json>,"snapshot_version"?: number,"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_resume_id_fkey"
      columns: ["resume_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"detail": NonNullable<Json>,"id": number,"target_id": string | null,"target_table": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"target_id"?: string | null,"target_table"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"target_id"?: string | null,"target_table"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"documents": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"mime_type": string,"name": string,"size_bytes": number,"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"mime_type": string,"name": string,"size_bytes": number,"storage_path": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"mime_type"?: string,"name"?: string,"size_bytes"?: number,"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"email_log": {
                  Row: {
                    "created_at": string,"error": string | null,"id": number,"kind": string,"resend_id": string | null,"status": string,"to_email": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"id"?: never,"kind": string,"resend_id"?: string | null,"status"?: string,"to_email": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"id"?: never,"kind"?: string,"resend_id"?: string | null,"status"?: string,"to_email"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"entitlements": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"id": string,"job_id": string | null,"order_id": string | null,"org_id": string,"package": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"id"?: string,"job_id"?: string | null,"order_id"?: string | null,"org_id": string,"package": string,"used_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"id"?: string,"job_id"?: string | null,"order_id"?: string | null,"org_id"?: string,"package"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "entitlements_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entitlements_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entitlements_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"interviews": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"meeting_url": string | null,"notes": string,"starts_at": string,"title": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"meeting_url"?: string | null,"notes"?: string,"starts_at": string,"title"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"meeting_url"?: string | null,"notes"?: string,"starts_at"?: string,"title"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interviews_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "tracker_items"
      referencedColumns: ["id"]
    }
                  ]
                },"job_questions": {
                  Row: {
                    "id": string,"job_id": string,"position": number,"prompt": string,"required": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"job_id": string,"position"?: number,"prompt": string,"required"?: boolean
                  }
                  Update: {
                    "id"?: string,"job_id"?: string,"position"?: number,"prompt"?: string,"required"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_questions_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "apply_method": string,"apply_url": string | null,"category": string | null,"created_at": string,"created_by": string | null,"description": string,"eligible_countries": (string)[],"employment_type": string | null,"expires_at": string | null,"featured_until": string | null,"id": string,"office_places": (string)[],"org_id": string,"published_at": string | null,"review_note": string | null,"role": string | null,"salary_currency": string | null,"salary_max": number | null,"salary_min": number | null,"salary_period": string | null,"search": unknown,"seniority": string | null,"slug": string,"source": string,"source_url": string | null,"status": string,"time_zones": (string)[],"title": string,"updated_at": string,"workplace": string | null,"job_missing": string | null
                  }
                  ComputedFields: "job_missing"
                  Insert: {
                    "apply_method"?: string,"apply_url"?: string | null,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"eligible_countries"?: (string)[],"employment_type"?: string | null,"expires_at"?: string | null,"featured_until"?: string | null,"id"?: string,"office_places"?: (string)[],"org_id": string,"published_at"?: string | null,"review_note"?: string | null,"role"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"salary_period"?: string | null,"search"?: never,"seniority"?: string | null,"slug": string,"source"?: string,"source_url"?: string | null,"status"?: string,"time_zones"?: (string)[],"title": string,"updated_at"?: string,"workplace"?: string | null
                  }
                  Update: {
                    "apply_method"?: string,"apply_url"?: string | null,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"eligible_countries"?: (string)[],"employment_type"?: string | null,"expires_at"?: string | null,"featured_until"?: string | null,"id"?: string,"office_places"?: (string)[],"org_id"?: string,"published_at"?: string | null,"review_note"?: string | null,"role"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"salary_period"?: string | null,"search"?: never,"seniority"?: string | null,"slug"?: string,"source"?: string,"source_url"?: string | null,"status"?: string,"time_zones"?: (string)[],"title"?: string,"updated_at"?: string,"workplace"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jobs_role_fkey"
      columns: ["role"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["slug"]
    }
                  ]
                },"jobs_queue": {
                  Row: {
                    "attempts": number,"created_at": string,"done_at": string | null,"error": string | null,"id": number,"kind": string,"locked_at": string | null,"payload": NonNullable<Json>,"run_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"done_at"?: string | null,"error"?: string | null,"id"?: never,"kind": string,"locked_at"?: string | null,"payload"?: NonNullable<Json>,"run_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"done_at"?: string | null,"error"?: string | null,"id"?: never,"kind"?: string,"locked_at"?: string | null,"payload"?: NonNullable<Json>,"run_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_prefs": {
                  Row: {
                    "application_updates": boolean,"job_alerts": boolean,"new_applicants": boolean,"product_news": boolean,"updated_at": string,"user_id": string,"weekly_digest": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "application_updates"?: boolean,"job_alerts"?: boolean,"new_applicants"?: boolean,"product_news"?: boolean,"updated_at"?: string,"user_id": string,"weekly_digest"?: boolean
                  }
                  Update: {
                    "application_updates"?: boolean,"job_alerts"?: boolean,"new_applicants"?: boolean,"product_news"?: boolean,"updated_at"?: string,"user_id"?: string,"weekly_digest"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"orders": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"currency": string,"id": string,"job_id": string | null,"org_id": string | null,"org_name": string | null,"package": string,"paid_at": string | null,"receipt_url": string | null,"refunded_at": string | null,"status": string,"stripe_payment_intent": string | null,"stripe_session_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"job_id"?: string | null,"org_id"?: string | null,"org_name"?: string | null,"package": string,"paid_at"?: string | null,"receipt_url"?: string | null,"refunded_at"?: string | null,"status"?: string,"stripe_payment_intent"?: string | null,"stripe_session_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"job_id"?: string | null,"org_id"?: string | null,"org_name"?: string | null,"package"?: string,"paid_at"?: string | null,"receipt_url"?: string | null,"refunded_at"?: string | null,"status"?: string,"stripe_payment_intent"?: string | null,"stripe_session_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"org_invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"org_id": string,"revoked_at": string | null,"role": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"org_id": string,"revoked_at"?: string | null,"role"?: string,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"org_id"?: string,"revoked_at"?: string | null,"role"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_invites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"org_members": {
                  Row: {
                    "created_at": string,"org_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"org_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"org_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_members_profile_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"org_slug_history": {
                  Row: {
                    "changed_at": string,"org_id": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"org_id": string,"slug": string
                  }
                  Update: {
                    "changed_at"?: string,"org_id"?: string,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_slug_history_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"orgs": {
                  Row: {
                    "about": string | null,"business_verified_at": string | null,"business_verified_note": string | null,"created_at": string,"created_by": string | null,"email_verified_domain": string | null,"id": string,"industry": string | null,"logo_url": string | null,"name": string,"office_places": (string)[],"size": string | null,"slug": string,"suspended_at": string | null,"suspended_reason": string | null,"trusted": boolean,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "about"?: string | null,"business_verified_at"?: string | null,"business_verified_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"email_verified_domain"?: string | null,"id"?: string,"industry"?: string | null,"logo_url"?: string | null,"name": string,"office_places"?: (string)[],"size"?: string | null,"slug": string,"suspended_at"?: string | null,"suspended_reason"?: string | null,"trusted"?: boolean,"website"?: string | null
                  }
                  Update: {
                    "about"?: string | null,"business_verified_at"?: string | null,"business_verified_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"email_verified_domain"?: string | null,"id"?: string,"industry"?: string | null,"logo_url"?: string | null,"name"?: string,"office_places"?: (string)[],"size"?: string | null,"slug"?: string,"suspended_at"?: string | null,"suspended_reason"?: string | null,"trusted"?: boolean,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"places": {
                  Row: {
                    "country_code": string,"kind": string,"name": string,"slug": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "country_code": string,"kind": string,"name": string,"slug": string,"sort"?: number
                  }
                  Update: {
                    "country_code"?: string,"kind"?: string,"name"?: string,"slug"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "user_id": string
                  }
                  Update: {
                    "user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "city": string | null,"country_code": string | null,"created_at": string,"email": string | null,"full_name": string | null,"headline": string | null,"id": string,"intent": string | null,"languages": (string)[],"links": NonNullable<Json>,"open_to": (string)[],"phone": string | null,"preferences": NonNullable<Json>,"salary_hope_currency": string | null,"salary_hope_min": number | null,"salary_hope_period": string | null,"time_zone": string,"updated_at": string,"work_countries": (string)[],"years_experience": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"country_code"?: string | null,"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"headline"?: string | null,"id": string,"intent"?: string | null,"languages"?: (string)[],"links"?: NonNullable<Json>,"open_to"?: (string)[],"phone"?: string | null,"preferences"?: NonNullable<Json>,"salary_hope_currency"?: string | null,"salary_hope_min"?: number | null,"salary_hope_period"?: string | null,"time_zone"?: string,"updated_at"?: string,"work_countries"?: (string)[],"years_experience"?: number | null
                  }
                  Update: {
                    "city"?: string | null,"country_code"?: string | null,"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"headline"?: string | null,"id"?: string,"intent"?: string | null,"languages"?: (string)[],"links"?: NonNullable<Json>,"open_to"?: (string)[],"phone"?: string | null,"preferences"?: NonNullable<Json>,"salary_hope_currency"?: string | null,"salary_hope_min"?: number | null,"salary_hope_period"?: string | null,"time_zone"?: string,"updated_at"?: string,"work_countries"?: (string)[],"years_experience"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["slug"]
    }
                  ]
                },"reports": {
                  Row: {
                    "admin_note": string | null,"contact_email": string | null,"created_at": string,"details": string,"handled_at": string | null,"handled_by": string | null,"id": string,"job_id": string | null,"org_id": string | null,"reason": string,"reporter_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_note"?: string | null,"contact_email"?: string | null,"created_at"?: string,"details"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"job_id"?: string | null,"org_id"?: string | null,"reason": string,"reporter_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "admin_note"?: string | null,"contact_email"?: string | null,"created_at"?: string,"details"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"job_id"?: string | null,"org_id"?: string | null,"reason"?: string,"reporter_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "category": string,"name": string,"slug": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"name": string,"slug": string,"sort"?: number
                  }
                  Update: {
                    "category"?: string,"name"?: string,"slug"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"saved_jobs": {
                  Row: {
                    "created_at": string,"job_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"job_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"job_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_jobs_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_searches": {
                  Row: {
                    "created_at": string,"filters": NonNullable<Json>,"frequency": string,"id": string,"last_sent_at": string | null,"query": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"frequency"?: string,"id"?: string,"last_sent_at"?: string | null,"query"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"frequency"?: string,"id"?: string,"last_sent_at"?: string | null,"query"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stripe_events": {
                  Row: {
                    "id": string,"received_at": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"received_at"?: string,"type": string
                  }
                  Update: {
                    "id"?: string,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tasks": {
                  Row: {
                    "created_at": string,"done_at": string | null,"due_at": string | null,"id": string,"item_id": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"done_at"?: string | null,"due_at"?: string | null,"id"?: string,"item_id"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"done_at"?: string | null,"due_at"?: string | null,"id"?: string,"item_id"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "tracker_items"
      referencedColumns: ["id"]
    }
                  ]
                },"tracker_events": {
                  Row: {
                    "created_at": string,"detail": NonNullable<Json>,"id": string,"item_id": string,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"item_id": string,"kind": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"item_id"?: string,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracker_events_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "tracker_items"
      referencedColumns: ["id"]
    }
                  ]
                },"tracker_items": {
                  Row: {
                    "application_id": string | null,"applied_at": string | null,"company": string,"contacts": NonNullable<Json>,"created_at": string,"id": string,"job_id": string | null,"location": string | null,"notes": string,"position": number,"resume_id": string | null,"salary": string | null,"stage": string,"title": string,"updated_at": string,"url": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"applied_at"?: string | null,"company"?: string,"contacts"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"job_id"?: string | null,"location"?: string | null,"notes"?: string,"position"?: number,"resume_id"?: string | null,"salary"?: string | null,"stage"?: string,"title": string,"updated_at"?: string,"url"?: string | null,"user_id": string
                  }
                  Update: {
                    "application_id"?: string | null,"applied_at"?: string | null,"company"?: string,"contacts"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"job_id"?: string | null,"location"?: string | null,"notes"?: string,"position"?: number,"resume_id"?: string | null,"salary"?: string | null,"stage"?: string,"title"?: string,"updated_at"?: string,"url"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracker_items_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tracker_items_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tracker_items_resume_id_fkey"
      columns: ["resume_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"admin_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"apply_to_job":
{ Args: { "p_answers"?: Json,"p_job": string,"p_note"?: string,"p_resume": string }; Returns: string
                           },
"attach_credit":
{ Args: { "p_job": string,"p_package"?: string }; Returns: string
                           },
"can_refund":
{ Args: { "p_order": string }; Returns: boolean
                           },
"check_places":
{ Args: { "p_cities": (string)[],"p_countries": (string)[] }; Returns: undefined
                           },
"claim_queue":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"done_at": string | null,
"error": string | null,
"id": number,
"kind": string,
"locked_at": string | null,
"payload": NonNullable<Json>,
"run_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "jobs_queue"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_invite":
{ Args: { "p_email": string,"p_org": string,"p_role"?: string }; Returns: string
                           },
"create_org":
{ Args: { "p_name": string,"p_slug": string }; Returns: string
                           },
"dearmor":
{ Args: { "": string }; Returns: string
                           },
"expire_jobs":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"finish_queue":
{ Args: { "p_error"?: string,"p_final"?: boolean,"p_id": number }; Returns: undefined
                           },
"gen_random_uuid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"gen_salt":
{ Args: { "": string }; Returns: string
                           },
"grant_credits":
{ Args: { "p_admin": string,"p_count": number,"p_org": string }; Returns: undefined
                           },
"invite_preview":
{ Args: { "p_token": string }; Returns: {
              "company": string,"company_slug": string,"email": string,"inviter": string,"role": string,"status": string
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_free_email_domain":
{ Args: { "p_domain": string }; Returns: boolean
                           },
"is_org_member":
{ Args: { "p_org": string,"p_roles"?: (string)[] }; Returns: boolean
                           },
"job_missing":
{ Args: { "j": Omit<Database["public"]['Tables']["jobs"]['Row'], Database["public"]['Tables']["jobs"]['ComputedFields']> }; Returns: string
                           },
"job_ready":
{ Args: { "p_job": string }; Returns: string
                           },
"like_escape":
{ Args: { "p": string }; Returns: string
                           },
"mark_applied":
{ Args: { "p_job": string }; Returns: string
                           },
"my_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"org_suspended":
{ Args: { "p_org": string }; Returns: boolean
                           },
"org_trusted":
{ Args: { "p_org": string }; Returns: boolean
                           },
"payments_on":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"pgp_armor_headers":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"publish_job":
{ Args: { "p_job": string }; Returns: undefined
                           },
"record_payment":
{ Args: { "p_amount": number,"p_currency": string,"p_event": string,"p_order": string,"p_payment_intent": string,"p_session": string,"p_type": string }; Returns: string
                           },
"refresh_email_verified":
{ Args: { "p_org": string }; Returns: undefined
                           },
"refund_order":
{ Args: { "p_order": string }; Returns: undefined
                           },
"revoke_invite":
{ Args: { "p_id": string }; Returns: undefined
                           },
"save_job":
{ Args: { "p_job": string }; Returns: string
                           },
"search_jobs":
{ Args: { "category"?: string,"city"?: string,"country"?: string,"pay_only"?: boolean,"q"?: string,"role"?: string,"seniorities"?: (string)[],"types"?: (string)[],"workplaces"?: (string)[] }; Returns: {
              "apply_method": string,
"apply_url": string | null,
"category": string | null,
"created_at": string,
"created_by": string | null,
"description": string,
"eligible_countries": (string)[],
"employment_type": string | null,
"expires_at": string | null,
"featured_until": string | null,
"id": string,
"office_places": (string)[],
"org_id": string,
"published_at": string | null,
"review_note": string | null,
"role": string | null,
"salary_currency": string | null,
"salary_max": number | null,
"salary_min": number | null,
"salary_period": string | null,
"search": unknown,
"seniority": string | null,
"slug": string,
"source": string,
"source_url": string | null,
"status": string,
"time_zones": (string)[],
"title": string,
"updated_at": string,
"workplace": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"send_back_job":
{ Args: { "p_job": string,"p_note": string }; Returns: undefined
                           },
"set_payments":
{ Args: { "p_on": boolean }; Returns: undefined
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           },
"team_members":
{ Args: { "p_org": string }; Returns: {
              "email": string,"full_name": string,"joined_at": string,"role": string,"user_id": string
            }[]
                           },
"website_domain":
{ Args: { "p_url": string }; Returns: string
                           },
"withdraw_application":
{ Args: { "p_id": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
