// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../AccessController.sol";
import "../../interfaces/ICrossChainFilter.sol";
import "../../interfaces/IFeeMarket.sol";
import "../../interfaces/IHelixApp.sol";
import "../../interfaces/IInboundLane.sol";
import "../../interfaces/IMessageCommitment.sol";
import "../../interfaces/IOutboundLane.sol";

contract DarwiniaSub2EthMessageEndpoint is ICrossChainFilter, AccessController {
    uint32  immutable public remoteChainPosition;
    address immutable public inboundLane;
    address immutable public outboundLane;
    address immutable public feeMarket;

    address public remoteEndpoint;

    constructor(
        uint32 _remoteChainPosition,
        address _inboundLane,
        address _outboundLane,
        address _feeMarket
    ) {
        remoteChainPosition = _remoteChainPosition;
        inboundLane = _inboundLane;
        outboundLane = _outboundLane;
        feeMarket = _feeMarket;
        _initialize(msg.sender);
    }

    modifier onlyInboundLane() {
        (,,uint32 bridgedChainPosition, uint32 bridgedLanePosition) = IMessageCommitment(msg.sender).getLaneInfo();
        require(remoteChainPosition == bridgedChainPosition, "DarwiniaSub2EthMessageEndpoint:Invalid bridged chain position");
        require(inboundLane == msg.sender, "DarwiniaSub2EthMessageEndpoint:caller is not the inboundLane account");
        _;
    }

    modifier onlyOutBoundLane() {
        (,,uint32 bridgedChainPosition, uint32 bridgedLanePosition) = IMessageCommitment(msg.sender).getLaneInfo();
        require(remoteChainPosition == bridgedChainPosition, "DarwiniaSub2EthMessageEndpoint:Invalid bridged chain position");
        require(outboundLane == msg.sender, "DarwiniaSub2EthMessageEndpoint:caller is not the outboundLane account");
        _;
    }

    function setRemoteEndpoint(address _remoteEndpoint) external onlyAdmin {
        require(remoteEndpoint == address(0), "DarwiniaSub2EthMessageEndpoint:can only set once");
        remoteEndpoint = _remoteEndpoint;
    }

    function cross_chain_filter(
        uint32 bridgedChainPosition,
        uint32 bridgedLanePosition,
        address sourceAccount,
        bytes calldata
    ) external view returns (bool) {
        return remoteChainPosition == bridgedChainPosition && inboundLane == msg.sender && remoteEndpoint == sourceAccount;
    }

    function fee() public view returns(uint256) {
        return IFeeMarket(feeMarket).market_fee();
    }

    function sendMessage(address receiver, bytes calldata message) external onlyCaller payable returns (uint256) {
        bytes memory messageWithCaller = abi.encodeWithSelector(
            DarwiniaSub2EthMessageEndpoint.recvMessage.selector,
            receiver,
            message
        );
        uint256 id = IOutboundLane(outboundLane).send_message{value: msg.value}(remoteEndpoint, messageWithCaller);
        return truncateNonce(id);
    }

    function recvMessage(
        address receiver,
        bytes calldata message
    ) external onlyInboundLane whenNotPaused {
        require(hasRole(CALLEREE_ROLE, receiver), "DarwiniaSub2EthMessageEndpoint:receiver is not calleree");
        (bool result,) = receiver.call(message);
        require(result, "DarwiniaSub2EthMessageEndpoint:call app failed");
    }

    // we use nonce as message id
    function lastDeliveredMessageId() public view returns(uint256) {
        IInboundLane.InboundLaneNonce memory inboundLaneNonce = IInboundLane(inboundLane).inboundLaneNonce();
        return uint256(inboundLaneNonce.last_delivered_nonce);
    }

    function isMessageDelivered(uint256 messageId) public view returns (bool) {
        uint256 lastMessageId = lastDeliveredMessageId();
        return messageId <= lastMessageId;
    }

    function truncateNonce(uint256 id)
        public
        pure
        returns (uint256)
    {
        return id & 0xFFFFFFFFFFFFFFFF;
    }
}

