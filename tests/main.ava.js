import { Worker } from 'near-workspaces';
import { test } from 'ava';

test('should return message when account is already registered and not refund when no deposit is attached').todo();
test('should return message and refund predecessor caller when trying to pay for storage for an account that is already registered').todo();
test('should return message when trying to pay for storage with less than the required amount and refund predecessor caller').todo();
test('should throw when trying to transfer for an unregistered account').todo();
test('should register account and pay for storage').todo();
