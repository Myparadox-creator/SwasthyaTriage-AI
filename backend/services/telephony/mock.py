"""Mock Telephony Provider for realistic educational simulations.

Simulates an automated speech agent conducting an outbound follow-up call:
1. Dials patient phone and transitions through DIALING -> CONNECTED
2. Asks targeted follow-up questions from the missing items list
3. Simulates realistic patient speech responses in English/Hindi/Odia
4. Records CallTranscript turns with timestamps
5. Extracts clinical measurements and answers without faking diagnosis
6. Hands off cleanly to services.followups.complete_followup
"""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime
from typing import Any

from models import CallTranscript, Case, FollowUp, TeleCall, User
from models.enums import CallStatus, FollowUpStatus, MessageRole
from services.audit import AuditAction, record_audit
from services.telephony.base import CallTurnResult, TeleCallResult, TelephonyProvider

# Simulated patient dialogue banks by missing item and language
SIMULATED_RESPONSES: dict[str, dict[str, list[tuple[str, str, str]]]] = {
    # key -> language -> list of (question_text, simulated_patient_reply, extracted_val)
    "temperature": {
        "en": [
            ("What was the highest body temperature you measured recently?", "I measured with a digital thermometer and it was 101.4 degrees Fahrenheit this morning.", "101.4°F"),
            ("Do you currently have a fever or measured temperature?", "Yes, it reached 100.8 F around afternoon.", "100.8°F"),
        ],
        "hi": [
            ("Aapka taapmaan kitna tha jab aapne aakhri baar naapa?", "Subah thermometer se naapa tha, 101.2 degree fahrenheit tha.", "101.2°F"),
            ("Kya abhi bhi bukhar hai aur temperature kitna hai?", "Haan, bukhar 102 degree tak chala gaya tha kal raat ko.", "102.0°F"),
        ],
        "od": [
            ("Aapanankara jwara kete thila jetebele aapan maapithile?", "Sakaale thermometer re maapithili, 101.0 degree fahrenheit thila.", "101.0°F"),
        ],
    },
    "medication": {
        "en": [
            ("Are you currently taking any medications for this condition?", "I took Paracetamol 500mg twice yesterday after meals.", "Paracetamol 500mg"),
            ("Please list any tablets or syrups you have taken.", "Only Dolo 650 once a day and drinking warm fluids.", "Dolo 650"),
        ],
        "hi": [
            ("Kya aap abhi koi dawa le rahe hain?", "Sirf Paracetamol 500mg li hai subah aur sham ko.", "Paracetamol 500mg"),
        ],
        "od": [
            ("Aapana kichi aoushadha neuchhanti ki?", "Paracetamol gote tablet khaithili kali.", "Paracetamol"),
        ],
    },
    "duration": {
        "en": [
            ("For how many days have you been experiencing these symptoms?", "It started about 3 days ago on Tuesday.", "3 days"),
        ],
        "hi": [
            ("Yeh samasya kitne dino se ho rahi hai?", "Lagbhag 3 din se bukhar aur thakan lag rahi hai.", "3 days"),
        ],
        "od": [
            ("Kete dina hela ehi asubidha heuchi?", "3 dina hela emiti laguchi.", "3 days"),
        ],
    },
    "medical_history": {
        "en": [
            ("Do you have any existing medical conditions like diabetes or high blood pressure?", "I have mild hypertension for 2 years, managed with medicine.", "Hypertension (2 yrs)"),
            ("Any past medical conditions we should know about?", "No chronic illness, no diabetes.", "None reported"),
        ],
        "hi": [
            ("Kya aapko pehle se sugar, BP ya koi anya bimari hai?", "Mujhe 2 saal se high BP ki shikayat hai.", "Hypertension"),
        ],
        "od": [
            ("Aapanankara purbabu BP ba diabetes kichi achi ki?", "Na, purba ru kichi bada rog nahi.", "None reported"),
        ],
    },
    "spo2": {
        "en": [
            ("What was your oxygen saturation or pulse rate if measured?", "Pulse oximeter showed SpO2 97 percent and pulse 84.", "97%"),
        ],
        "hi": [
            ("Kya aapne oximeter se oxygen level jaancha hai?", "Haan, 98 percent oxygen dikha raha tha.", "98%"),
        ],
        "od": [
            ("Oxygen saturation kete achi jodi maapichhanti?", "97 percent achi pulse 82.", "97%"),
        ],
    },
}

DEFAULT_QUESTIONS = [
    "temperature",
    "medication",
    "duration",
]


class MockTelephonyProvider(TelephonyProvider):
    """Deterministic and rich mock telephony provider."""

    @property
    def name(self) -> str:
        return "mock"

    def create_outbound_call(
        self,
        *,
        db: Any,
        case: Case,
        phone_number: str | None,
        reason: str | None,
        questions: list[str],
        requested_by: User | None,
        followup_id: int | None = None,
    ) -> TeleCall:
        target_phone = phone_number or (case.patient.phone if case.patient else "+91-9876543210")
        call_public_id = f"tc_{uuid.uuid4().hex[:12]}"
        external_id = f"sim_vsdk_{uuid.uuid4().hex[:16]}"
        room_id = f"room_{uuid.uuid4().hex[:8]}"

        selected_items = questions if questions else DEFAULT_QUESTIONS

        call = TeleCall(
            public_id=call_public_id,
            case_id=case.id,
            followup_id=followup_id,
            requested_by_user_id=requested_by.id if requested_by else None,
            provider=self.name,
            phone_number=target_phone,
            status=CallStatus.REQUESTED,
            direction="OUTBOUND",
            reason=reason or "Follow-up verification of clinical intake",
            questions=selected_items,
            external_call_id=external_id,
            room_id=room_id,
            extracted_data={},
            duration_seconds=0,
        )
        db.add(call)
        db.flush()

        record_audit(
            db,
            AuditAction.FOLLOW_UP_STARTED,
            user=requested_by,
            case=case,
            metadata={
                "telecall_id": call.public_id,
                "phone": target_phone,
                "questions": selected_items,
            },
        )
        return call

    def start_call(self, *, db: Any, call: TeleCall) -> TeleCall:
        now = datetime.now(UTC)
        call.status = CallStatus.CONNECTED
        call.started_at = now
        call.answered_at = now
        db.flush()

        # Add initial greeting transcript if empty
        if not call.transcripts:
            case = db.get(Case, call.case_id)
            lang = case.language.value if (case and case.language) else "en"
            greeting = (
                "Namaste, I am calling from SwasthyaTriage AI on behalf of your healthcare team. "
                "I have a few follow-up questions to update your case."
                if lang == "en"
                else "Namaste, main SwasthyaTriage AI ki taraf se bol raha hoon aapki health information verify karne ke liye."
                if lang == "hi"
                else "Namaskar, mu SwasthyaTriage AI taraphare aapananka swasthya bishayare kichi tathya sangraha kariba pain call karuchi."
            )
            seq = 1
            db.add(
                CallTranscript(
                    call_id=call.id,
                    sequence=seq,
                    role=MessageRole.AI,
                    content=greeting,
                    language=lang,
                )
            )
            db.flush()

        return call

    def run_turn(
        self,
        *,
        db: Any,
        call: TeleCall,
        patient_reply_override: str | None = None,
    ) -> CallTurnResult:
        case = db.get(Case, call.case_id)
        lang = case.language.value if (case and case.language) else "en"

        questions: list[str] = call.questions or DEFAULT_QUESTIONS
        # Determine which question has already been answered
        extracted = dict(call.extracted_data or {})
        pending_items = [q for q in questions if q not in extracted]

        if not pending_items:
            # Everything has been asked
            return CallTurnResult(
                agent_question="Thank you for providing the details. Your healthcare team will review this promptly.",
                patient_response="Thank you, goodbye.",
                item_key="complete",
                extracted_value=None,
                is_last_question=True,
            )

        current_item = pending_items[0]
        item_bank = SIMULATED_RESPONSES.get(current_item, SIMULATED_RESPONSES.get("temperature", {}))
        lang_options = item_bank.get(lang, item_bank.get("en", [("Please tell me your current status.", "It is okay.", "Reported")]))

        selected_qa = random.choice(lang_options)
        q_text, simulated_reply, extracted_val = selected_qa

        actual_reply = patient_reply_override.strip() if patient_reply_override else simulated_reply

        # Persist transcripts
        max_seq = max((t.sequence for t in call.transcripts), default=0)
        db.add(
            CallTranscript(
                call_id=call.id,
                sequence=max_seq + 1,
                role=MessageRole.AI,
                content=q_text,
                language=lang,
            )
        )
        db.add(
            CallTranscript(
                call_id=call.id,
                sequence=max_seq + 2,
                role=MessageRole.PATIENT,
                content=actual_reply,
                language=lang,
            )
        )

        extracted[current_item] = extracted_val
        call.extracted_data = extracted
        call.duration_seconds = (call.duration_seconds or 0) + 38  # approximate seconds per turn
        db.flush()

        is_last = len(pending_items) <= 1

        return CallTurnResult(
            agent_question=q_text,
            patient_response=actual_reply,
            item_key=current_item,
            extracted_value=extracted_val,
            is_last_question=is_last,
        )

    def complete_call(
        self,
        *,
        db: Any,
        call: TeleCall,
        actor: User | None = None,
    ) -> TeleCallResult:
        now = datetime.now(UTC)
        call.status = CallStatus.COMPLETED
        call.ended_at = now
        if not call.duration_seconds or call.duration_seconds < 30:
            call.duration_seconds = max(45, len(call.transcripts) * 25)

        case = db.get(Case, call.case_id)
        extracted = dict(call.extracted_data or {})

        # If call is linked to a FollowUp row, invoke followups.complete_followup
        if call.followup_id:
            followup = db.get(FollowUp, call.followup_id)
            if followup and followup.status != FollowUpStatus.COMPLETED:
                from schemas.case import FollowUpAnswer
                from services.followups import complete_followup

                answers = [
                    FollowUpAnswer(item=k, value=str(v))
                    for k, v in extracted.items()
                ]
                summary_text = f"Automated tele-call completed ({call.duration_seconds}s). Collected: " + ", ".join(
                    f"{k}: {v}" for k, v in extracted.items()
                )
                complete_followup(
                    db,
                    followup,
                    answers=answers,
                    summary=summary_text,
                    actor=actor,
                )

        record_audit(
            db,
            AuditAction.TELECALL_COMPLETED,
            user=actor,
            case=case,
            metadata={
                "telecall_id": call.public_id,
                "duration_seconds": call.duration_seconds,
                "extracted_data": extracted,
            },
        )

        db.flush()

        transcripts_list = [
            {"role": t.role.value, "content": t.content, "language": t.language or "en"}
            for t in call.transcripts
        ]

        return TeleCallResult(
            call_id=call.id,
            duration_seconds=call.duration_seconds,
            transcripts=transcripts_list,
            extracted_data=extracted,
        )
