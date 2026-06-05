# CeilingMarketApp Agent Instructions

## Project Overview

CeilingMarketApp is a React Native marketplace application for the stretch ceiling industry.

The goal is to connect:

* Employers (customers, companies, dealers)
* Installers (workers, ceiling монтажники)

This is NOT a social network and NOT a messenger.

The main value of the application is managing ceiling installation orders from creation to completion.

---

## Technology Stack

* Expo
* React Native
* TypeScript
* Firebase Authentication
* Firestore Database
* Expo Router / React Navigation

---

## Development Rules

* Keep Expo architecture.
* Do not migrate to bare React Native.
* Do not introduce a custom backend unless explicitly requested.
* Prefer Firebase Auth and Firestore.
* Keep compatibility with current Expo SDK and package.json dependencies.
* Do not remove existing screens without a strong reason.
* Preserve current navigation structure.

---

## User Roles

### Employer

Creates orders.

Fields:

* uid
* phoneNumber
* displayName
* photoURL
* rating
* city

Actions:

* create order
* edit order
* select installer
* complete order
* rate installer

### Worker

Accepts and performs orders.

Fields:

* uid
* phoneNumber
* displayName
* photoURL
* rating
* portfolioPhotos
* city

Actions:

* browse orders
* apply for orders
* accept assigned orders
* change order status
* complete work

---

## Main Collections

### users

Stores user profiles.

Typical fields:

* uid
* role
* phoneNumber
* displayName
* city
* rating
* photoURL
* createdAt

---

### orders

Stores ceiling installation orders.

Typical fields:

* employerId
* workerId
* title
* description
* address
* city
* price
* status
* candidates
* createdAt
* updatedAt

---

### chats

Stores conversations between employer and worker.

Typical fields:

* participants
* lastMessage
* updatedAt

---

## Order Lifecycle

Valid statuses:

created

accepted

in_work

completed

cancelled

Workers should only move orders through valid status transitions.

---

## Marketplace Principles

The application is designed to replace chaotic Telegram order distribution.

The focus is:

* order management
* accountability
* installer reputation
* employer reputation
* status tracking
* order history

The application is NOT intended to be a simple chat replacement.

---

## Future Features

Planned but not always implemented:

* ratings
* portfolios
* blacklists
* subscriptions
* premium accounts
* verification
* advanced search
* analytics

When working on the codebase, do not assume these features are fully implemented.

---

## Firebase Notes

Common issue areas:

* Firebase Auth initialization
* Firestore Rules
* Phone Authentication
* Expo compatibility

Before changing authentication code:

* verify imports
* verify Firebase initialization
* avoid duplicate auth initialization

---

## Quality Expectations

Before completing tasks:

Run:

npm install

Run:

npx tsc --noEmit

Avoid introducing breaking changes.

Prefer minimal and targeted fixes over large rewrites.
