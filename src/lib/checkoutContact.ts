/**
 * Customer contact rules for the checkout form.
 *
 * Keep these identical to the rules in checkOrder() in api/_lib/notify.ts,
 * otherwise the form can accept something the server rejects (you would see a
 * 400 "customerPhone must be a valid phone number" in the Network tab).
 */

export interface ContactDetails {
    name: string;
    phone: string;
}

export interface ContactErrors {
    name?: string;
    phone?: string;
}

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const PHONE_PATTERN = /^\+?[0-9\s\-().]{7,30}$/;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

/** Returns an error message, or null when the name is fine. */
export function validateName(value: string): string | null {
    const name = value.trim();

    if (name.length < NAME_MIN_LENGTH) return "Please enter your full name";
    if (name.length > NAME_MAX_LENGTH) {
        return `Name must be ${NAME_MAX_LENGTH} characters or fewer`;
    }

    return null;
}

/** Returns an error message, or null when the phone number is fine. */
export function validatePhone(value: string): string | null {
    const phone = value.trim();
    const digits = phone.replace(/\D/g, "").length;

    if (
        !PHONE_PATTERN.test(phone) ||
        digits < PHONE_MIN_DIGITS ||
        digits > PHONE_MAX_DIGITS
    ) {
        return "Enter a valid phone number, e.g. +234 801 234 5678";
    }

    return null;
}

/** Returns an object with one message per invalid field (empty object = all valid). */
export function validateContact(details: ContactDetails): ContactErrors {
    const errors: ContactErrors = {};

    const nameError = validateName(details.name);
    if (nameError) errors.name = nameError;

    const phoneError = validatePhone(details.phone);
    if (phoneError) errors.phone = phoneError;

    return errors;
}

/** Trims and collapses repeated spaces. Call before validating and sending. */
export function cleanContact(details: ContactDetails): ContactDetails {
    return {
        name: details.name.replace(/\s+/g, " ").trim(),
        phone: details.phone.replace(/\s+/g, " ").trim(),
    };
}
