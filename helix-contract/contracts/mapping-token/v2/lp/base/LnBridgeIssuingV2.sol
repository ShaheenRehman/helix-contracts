// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interface/ILnBridgeBackingV2.sol";
import "./LnBridgeHelper.sol";

contract LnBridgeIssuingV2 is LnBridgeHelper {
    uint256 constant public MIN_WITHDRAW_TIMESTAMP = 30 * 60;
    struct IssuedMessageInfo {
        uint64 nonce;
        uint64 lastRefundNonce;
        uint64 refundStartTime;
    }
    mapping(bytes32 => IssuedMessageInfo) public issuedMessages;
    mapping(bytes32 => address) public refundReceiver;

    event TransferRelayed(bytes32 transferId, address relayer);

    function relay(
        bytes32 lastTransferId,
        bytes32 lastBlockHash,
        uint64 nonce,
        address token,
        address receiver,
        uint112 amount
    ) payable external {
        IssuedMessageInfo memory lastInfo = issuedMessages[lastTransferId];
        require(lastInfo.nonce + 1 == nonce, "Invalid last transferId");
        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            lastBlockHash,
            nonce,
            token,
            receiver,
            amount));
        IssuedMessageInfo memory transferInfo = issuedMessages[transferId];
        require(transferInfo.nonce == 0 || transferInfo.refundStartTime > 0, "lpBridgeIssuing:message exist");
        require(transferInfo.refundStartTime + MIN_WITHDRAW_TIMESTAMP < block.timestamp, "refund time expired");
        if (lastInfo.refundStartTime > 0) {
            issuedMessages[transferId] = IssuedMessageInfo(nonce, nonce - 1, 0);
        } else {
            issuedMessages[transferId] = IssuedMessageInfo(nonce, lastInfo.lastRefundNonce, 0);
        }
        if (token == address(0)) {
            require(msg.value == amount, "lpBridgeIssuing:invalid amount");
            payable(receiver).transfer(amount);
        } else {
            _safeTransferFrom(token, msg.sender, receiver, uint256(amount));
        }
        emit TransferRelayed(transferId, msg.sender);
    }

    function _encodeRefundCall(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address receiver,
        address rewardReceiver
    ) internal pure returns(bytes memory) {
        return abi.encodeWithSelector(
            ILnBridgeBackingV2.refund.selector,
            lastRefundTransferId,
            transferId,
            receiver,
            rewardReceiver
        );
    }

    function _encodeWithdrawMarginCall(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        address provider,
        uint112 amount
    ) internal pure returns(bytes memory) {
        return abi.encodeWithSelector(
            ILnBridgeBackingV2.withdrawMargin.selector,
            lastRefundTransferId,
            lastTransferId,
            provider,
            amount
        );
    }

    function _initCancelIssuing(
        bytes32 lastTransferId,
        bytes32 lastBlockHash,
        address token,
        address receiver,
        uint64 nonce,
        uint112 amount
    ) internal {
        IssuedMessageInfo memory lastInfo = issuedMessages[lastTransferId];
        require(lastInfo.nonce + 1 == nonce, "invalid last transfer nonce");
        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            lastBlockHash,
            token,
            receiver,
            nonce,
            amount));
        IssuedMessageInfo memory transferInfo = issuedMessages[transferId];
        require(transferInfo.nonce == 0, "lpBridgeIssuing:message exist");
        require(transferInfo.refundStartTime == 0, "refund has been init");

        uint64 lastRefundNonce = lastInfo.refundStartTime > 0 ? nonce - 1 : lastInfo.lastRefundNonce;
        issuedMessages[transferId] = IssuedMessageInfo(nonce, lastRefundNonce, uint64(block.timestamp));
        refundReceiver[transferId] = receiver;
    }

    // anyone can cancel
    function _requestCancelIssuing(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        bytes32 transferId
    ) internal view returns(bytes memory message) {
        IssuedMessageInfo memory lastInfo = issuedMessages[lastTransferId];
        IssuedMessageInfo memory transferInfo = issuedMessages[transferId];
        require(transferInfo.nonce == lastInfo.nonce + 1, "invalid last transferInfo");
        require(transferInfo.refundStartTime + MIN_WITHDRAW_TIMESTAMP < block.timestamp, "refund time expired");
        IssuedMessageInfo memory lastRefundInfo = issuedMessages[lastRefundTransferId];
        require(lastRefundInfo.nonce == transferInfo.lastRefundNonce, "invalid last refundid");
        address receiver = refundReceiver[transferId];
        require(receiver != address(0), "no receiver");
        return _encodeRefundCall(
            lastRefundTransferId,
            transferId,
            receiver,
            msg.sender
        );
    }

    function _requestWithdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        uint112 amount
    ) internal view returns(bytes memory message) {
        IssuedMessageInfo memory lastInfo = issuedMessages[lastTransferId];
        IssuedMessageInfo memory lastRefundInfo = issuedMessages[lastRefundTransferId];
        require(lastInfo.lastRefundNonce == lastRefundInfo.nonce, "invalid last refundid");

        return _encodeWithdrawMarginCall(
            lastRefundTransferId,
            lastTransferId,
            msg.sender,
            amount
        );
    }
}

